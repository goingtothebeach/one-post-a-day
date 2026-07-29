#!/usr/bin/env bash
# One Post A Day —— 后端服务器初始化（Ubuntu 22.04）
#
# 只依赖 Ubuntu + Python + MySQL + nginx，不绑定任何云厂商：
# 阿里云/腾讯云/Vultr/Hetzner 等都能直接用（图片仍存阿里云 OSS，与服务器无关）。
#
# 在【服务器上】以 root 执行一次即可。可重复运行（幂等）：
#   ssh root@<服务器公网IP>
#   bash setup-ecs.sh
#
# 做的事：装依赖 → 建库 → 拉代码 → 装 Python 包 → 写 systemd → 配 nginx。
# 不做的事：不申请证书（需要 DNS 先解析好，脚本最后会提示命令）、
#          不填密钥（交互式提示你填，或事后编辑 /etc/onedayapost.env）。

set -euo pipefail

REPO="${REPO:-https://github.com/goingtothebeach/one-post-a-day.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/onedayapost
ENV_FILE=/etc/onedayapost.env
DB_NAME=one_post_a_day
DB_USER=onedayapost
DOMAIN="${DOMAIN:-api.onedayapost.fun}"

say()  { printf '\n\033[1;33m━━ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }

# 轻量应用服务器的默认用户常是 admin / ubuntu 而非 root，但有免密 sudo。
# 不强制要求 root 登录，非 root 时自动用 sudo 重新执行自己。
if [[ $EUID -ne 0 ]]; then
  if sudo -n true 2>/dev/null; then
    echo "当前非 root，改用 sudo 重新执行…"
    exec sudo -E bash "$0" "$@"
  fi
  echo "请用 root 执行，或确保当前用户有免密 sudo"
  exit 1
fi

say "1/8 系统依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip git nginx \
    mysql-server certbot python3-certbot-nginx tzdata curl >/dev/null
timedatectl set-timezone Asia/Shanghai
ok "已安装，时区设为 Asia/Shanghai"

say "2/8 内存与 swap"
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
ok "物理内存 ${MEM_MB} MB，现有 swap ${SWAP_MB} MB"
# 小内存机型没有 swap 时，MySQL 峰值会触发 OOM Killer（通常先杀 mysqld）。
# 建 2G swap 兜底：磁盘很充裕，代价可忽略。
if [[ $SWAP_MB -lt 512 && $MEM_MB -lt 4096 ]]; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # 有 swap 但优先用物理内存：数据库场景不希望频繁换出
    sysctl -q -w vm.swappiness=10
    grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
    ok "已创建 2G swap（swappiness=10）"
  else
    swapon /swapfile 2>/dev/null || true
    ok "/swapfile 已存在，已启用"
  fi
else
  ok "无需额外 swap"
fi

say "3/8 MySQL 数据库"
systemctl enable --now mysql >/dev/null 2>&1 || true
if [[ -f $ENV_FILE ]] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  DB_PASS="$(sed -n 's|^DATABASE_URL=mysql+pymysql://[^:]*:\([^@]*\)@.*|\1|p' "$ENV_FILE")"
  ok "复用已有数据库密码"
else
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  ok "已生成数据库密码"
fi
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
ok "库 ${DB_NAME} 与用户 ${DB_USER} 就绪"

# 小内存机型调优：默认 InnoDB 缓冲池 128M + 每连接开销，在 1-2G 机器上偏大。
# 本项目数据量极小（一天最多一帖，库不到几十 MB），缓冲池给 64M 完全够。
if [[ $MEM_MB -lt 2560 ]]; then
  cat > /etc/mysql/mysql.conf.d/zz-small-memory.cnf <<'CNF'
# 由 setup-ecs.sh 生成：适配 <2.5G 内存机型
# 本项目写入量被产品规则锁死（一天一帖），无需大缓冲池
[mysqld]
innodb_buffer_pool_size = 64M
innodb_log_buffer_size  = 8M
max_connections         = 30
performance_schema      = OFF
CNF
  systemctl restart mysql
  ok "已写入 MySQL 小内存配置（缓冲池 64M，max_connections 30）"
fi

say "4/8 代码"
# 代码可以来自两种方式：
#   a) git clone/pull（需要仓库可访问；私有仓库要 Deploy Key）
#   b) 本地 rsync 推上来（跳过 git，设 SKIP_GIT=1）
# 判断依据：目录里已经有 server/main.py 就认为是 rsync 上来的，不动它。
if [[ "${SKIP_GIT:-0}" == "1" ]] || [[ -f $APP_DIR/server/main.py && ! -d $APP_DIR/.git ]]; then
  if [[ -f $APP_DIR/server/main.py ]]; then
    ok "使用已存在的代码（rsync 方式），跳过 git"
  else
    echo "SKIP_GIT=1 但 $APP_DIR/server/main.py 不存在，请先 rsync 代码"; exit 1
  fi
elif [[ -d $APP_DIR/.git ]]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
  ok "已更新到 origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
  ok "已克隆到 $APP_DIR"
fi

say "5/8 Python 环境"
python3 -m venv "$APP_DIR/venv" 2>/dev/null || true
"$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/server/requirements.txt"
ok "依赖已安装"

say "6/8 环境变量 $ENV_FILE"
if [[ -f $ENV_FILE ]]; then
  warn "已存在，保留不动。要改请手动编辑：nano $ENV_FILE"
else
  JWT="$(openssl rand -hex 32)"
  CRON="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=mysql+pymysql://${DB_USER}:${DB_PASS}@127.0.0.1:3306/${DB_NAME}
JWT_SECRET=${JWT}
CRON_SECRET=${CRON}
CORS_ORIGINS=https://onedayapost.fun,https://www.onedayapost.fun

# 阿里云 OSS —— 从本地 server/.env 抄过来
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_OSS_ROLE_ARN=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
ALIYUN_OSS_STS_DURATION=3600

# 号码认证服务（融合认证需在控制台开启）
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=
ALIYUN_SMS_SCHEME=

# 生产必须为 0
DEV_FAKE_OTP=0
EOF
  chmod 600 "$ENV_FILE"
  ok "已生成（JWT_SECRET / CRON_SECRET 随机，权限 600）"
  warn "阿里云那几项还是空的，启动前必须填！"
fi

say "7/8 systemd 服务"
install -m 644 "$APP_DIR/deploy/onedayapost-api.service" \
  /etc/systemd/system/onedayapost-api.service
chown -R www-data:www-data "$APP_DIR"
systemctl daemon-reload
systemctl enable onedayapost-api >/dev/null 2>&1
ok "onedayapost-api.service 已注册"

say "8/8 nginx"
sed "s/api\.onedayapost\.fun/${DOMAIN}/g" "$APP_DIR/deploy/api.nginx.conf" \
  > /etc/nginx/sites-available/onedayapost-api
ln -sf /etc/nginx/sites-available/onedayapost-api /etc/nginx/sites-enabled/onedayapost-api
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/html
# 证书还没签发时，443 段会让 nginx -t 失败，所以先只留 HTTP 段
if [[ ! -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ]]; then
  warn "证书尚未签发，暂时只启用 HTTP（跑完 certbot 会自动补上 443）"
  awk '/^server \{/{n++} n<2' /etc/nginx/sites-available/onedayapost-api \
    > /etc/nginx/sites-available/onedayapost-api.http
  mv /etc/nginx/sites-available/onedayapost-api.http \
     /etc/nginx/sites-available/onedayapost-api
fi
nginx -t && systemctl reload nginx
ok "nginx 已配置"

cat <<TXT

────────────────────────────────────────
初始化完成。接下来：

1) 填阿里云密钥（把本地 server/.env 里的值抄进来）
     nano $ENV_FILE

2) 启动后端
     systemctl start onedayapost-api
     systemctl status onedayapost-api --no-pager
     curl -s localhost:4000/health

3) DNS：把 ${DOMAIN} 的 A 记录指向本机公网 IP
     公网 IP: $(curl -s -m 5 https://api.ipify.org || echo '查询失败，用 ip addr 自查')
   解析生效后再签证书（顺序反了会失败）：
     certbot --nginx -d ${DOMAIN}

4) 防火墙/安全组：放行 80 / 443；【不要】放行 3306 和 4000

5) GitHub Actions Secrets 配两项：
     API_BASE_URL = https://${DOMAIN}
     CRON_SECRET  = 见下（必须一致，否则抽签返回 503）
     grep CRON_SECRET $ENV_FILE

6) 前端 app/config/api.ts 已指向 https://api.onedayapost.fun。
   若你换了域名，改这里并重新构建 push（Vercel 自动部署）；
   也可以不改代码，构建时传 EXPO_PUBLIC_API_BASE=https://${DOMAIN}
────────────────────────────────────────
TXT
