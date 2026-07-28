"""已弃用 —— 请勿再启用。

抽签统一由 GitHub Actions 的 cron 调 `POST /lottery/run` 触发，
见 `.github/workflows/daily-lottery.yml` 与 `app/lottery.py:draw_round`。

历史问题：这里的 BackgroundScheduler 曾在 main.py 的 lifespan 里被启动，
和 cron 同时在 18:00 抽签，两次抽出不同赢家、后一次覆写 winner_user_id，
导致先中签并已发帖的人失去发帖权、新赢家又因 publish_date 已存在而发不出来。
多实例部署时每个进程还会各跑一次，放大问题。

如果将来要把定时任务收回进程内（例如迁到自建 ECS 后不想依赖 GitHub Actions），
必须同时满足：
  1. 只有单实例在跑，或用数据库锁 / 分布式锁保证全局只执行一次；
  2. 复用 `app.lottery.draw_round()`（它是幂等的），不要再复制一份抽签逻辑；
  3. 轮次用 `app.timewin.draw_date_for_run()` 判定，不要用「执行时刻的自然日」。
"""
