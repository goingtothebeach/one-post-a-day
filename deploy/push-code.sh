#!/usr/bin/env bash
# 把本地后端代码 rsync 到服务器并重启服务。
#
# 用法（在项目根目录）：
#   ./deploy/push-code.sh            # 传代码 + 重启
#   ./deploy/push-code.sh --dry-run  # 只看会传什么，不动服务器
#   HOST=1.2.3.4 SSH_USER=admin ./deploy/push-code.sh
#
# 为什么不用 git：仓库是私有的，给服务器配 Deploy Key 多一份凭证要管；
# 而这个项目每次前端变更都要重新构建 dist（走 Vercel），
# 后端代码量很小（~230KB），rsync 更直接。

set -euo pipefail

HOST="${HOST:-47.243.211.168}"
# 不要用 $USER：它是 shell 内置的当前登录用户名，会覆盖掉这里的默认值
SSH_USER="${SSH_USER:-admin}"
APP_DIR="${APP_DIR:-/opt/onedayapost}"
DRY=""
[[ "${1:-}" == "--dry-run" ]] && DRY="--dry-run"

cd "$(dirname "$0")/.."

# 只传后端运行需要的东西。凭证一律不传——服务器用 /etc/onedayapost.env。
rsync -az --delete $DRY \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '!.env.example' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude '.DS_Store' \
  --rsync-path="sudo rsync" \
  server/ "$SSH_USER@$HOST:$APP_DIR/server/"

rsync -az $DRY \
  --exclude '.DS_Store' \
  --rsync-path="sudo rsync" \
  deploy/ "$SSH_USER@$HOST:$APP_DIR/deploy/"

if [[ -n "$DRY" ]]; then
  echo "（dry-run，未改动服务器）"
  exit 0
fi

echo "代码已同步，重启服务…"
ssh "$SSH_USER@$HOST" '
  sudo chown -R www-data:www-data /opt/onedayapost
  # 依赖可能有变动，装一次很快（已装则跳过）
  sudo /opt/onedayapost/venv/bin/pip install -q -r /opt/onedayapost/server/requirements.txt 2>/dev/null || true
  if systemctl is-enabled onedayapost-api >/dev/null 2>&1; then
    sudo systemctl restart onedayapost-api
    sleep 2
    systemctl is-active onedayapost-api >/dev/null \
      && echo "  服务已重启并在运行 ✓" \
      || { echo "  !! 启动失败，最近日志："; sudo journalctl -u onedayapost-api -n 20 --no-pager; exit 1; }
    curl -sf -m 5 localhost:4000/health && echo "  /health 正常 ✓" || echo "  !! /health 无响应"
  else
    echo "  服务尚未安装（先跑 setup-ecs.sh）"
  fi
'
