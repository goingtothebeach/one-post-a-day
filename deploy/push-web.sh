#!/usr/bin/env bash
# 构建前端并部署到自己的服务器（替代 Vercel）。
#
# 用法（项目根目录）：
#   ./deploy/push-web.sh              # 构建 + 上传
#   ./deploy/push-web.sh --no-build   # 只上传现有 dist
#   HOST=1.2.3.4 SSH_USER=admin ./deploy/push-web.sh
#
# 为什么不用 Vercel：后台登不上，且它从 7/28 起就没再部署过
# （线上一直是旧 bundle）。自己的服务器上 nginx 已在跑后端反代，
# 顺带 serve 静态文件几乎没有额外成本。

set -euo pipefail

HOST="${HOST:-47.243.211.168}"
# 不用 $USER：那是 shell 内置的当前登录用户名，会覆盖默认值
SSH_USER="${SSH_USER:-admin}"
WEB_DIR="${WEB_DIR:-/var/www/onedayapost}"

cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--no-build" ]]; then
  echo "构建前端…"
  npx expo export -p web
  # 必须跑：关掉 SSR hydration（修 Tab 错位）+ 注入 PWA 标签和图标
  node scripts/inject-fonts.js
fi

[[ -f dist/index.html ]] || { echo "dist/index.html 不存在，先构建"; exit 1; }

echo "上传到 $SSH_USER@$HOST:$WEB_DIR …"
ssh "$SSH_USER@$HOST" "sudo mkdir -p $WEB_DIR"

# 远端用 sudo 接收：目录归属是 www-data，普通用户写不进去。
# （曾因此失败：上一次部署 chown 成 www-data 后，下一次 rsync 全部 Permission denied）
# --delete 清掉上一版的旧 bundle，避免磁盘里堆积无用的 entry-*.js
# --omit-dir-times 避免对根目录 set times 报错
rsync -az --delete --omit-dir-times \
  --rsync-path="sudo rsync" \
  --exclude '.DS_Store' \
  dist/ "$SSH_USER@$HOST:$WEB_DIR/"

ssh "$SSH_USER@$HOST" "
  sudo chown -R www-data:www-data $WEB_DIR
  sudo find $WEB_DIR -type d -exec chmod 755 {} \;
  sudo find $WEB_DIR -type f -exec chmod 644 {} \;
  echo '  文件数: '\$(find $WEB_DIR -type f | wc -l)
  echo '  体积:   '\$(du -sh $WEB_DIR | cut -f1)
"

echo "验证…"
for p in / /manifest.json; do
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://onedayapost.fun$p" || echo 000)
  echo "  $p -> HTTP $code"
done
echo "完成。"
