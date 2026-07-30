#!/usr/bin/env bash
# 由 onedayapost-lottery.service 调用：每晚 18:00 触发当轮开奖。
#
# 为什么不把 curl 直接写进 unit 的 ExecStart：
# unit 文件是 644，secret 不能写进去；而即使用 ${CRON_SECRET} 让 systemd 展开，
# 它也会进入命令行 argv —— `ps aux` 和 `systemctl show` 都看得见。
# 这里 secret 从环境变量（unit 的 EnvironmentFile 注入）取，再用 `curl -K -`
# 从 stdin 喂配置，全程不进任何进程的 argv。
set -uo pipefail

# 默认打回环：开奖这件事不该依赖 DNS / TLS / 证书有效期 / 公网出网。
# 需要顺带体检 nginx 反代时，临时传
#   LOTTERY_URL=https://api.onedayapost.fun/lottery/run
URL="${LOTTERY_URL:-http://127.0.0.1:4000/lottery/run}"

: "${CRON_SECRET:?未注入 CRON_SECRET（unit 需带 EnvironmentFile=/etc/onedayapost.env）}"

# retry 是给 Persistent=true 的补跑场景准备的：那时 timer 在开机瞬间触发，
# uvicorn 可能还没 listen（main.py 启动时还要同步跑 alembic 迁移）。
printf '%s\n' \
  "url = \"$URL\"" \
  "request = POST" \
  "header = \"X-Cron-Secret: $CRON_SECRET\"" \
  "silent" \
  "show-error" \
  "fail-with-body" \
  "connect-timeout = 5" \
  "max-time = 30" \
  "retry = 5" \
  "retry-delay = 10" \
  "retry-connrefused" \
  "write-out = \"\\nHTTP %{http_code} in %{time_total}s\\n\"" \
  | curl -K -
