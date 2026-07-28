"""抽签轮次 / 发帖窗口的唯一定义。

历史上 lottery.py、post.py、scheduler.py 各自复制了一份时间helper，
其中 /lottery/run 用「执行时刻的自然日」推断轮次，导致 cron 延迟跨过午夜时
会去抽下一轮的票、而当轮永不开奖。所有轮次判断统一走这里。

约定：
- 轮次用该轮抽签日的零点（naive 北京时间）标识，存进 tickets.draw_date / lotteries.draw_date。
- 每晚 DRAW_HOUR(18:00) 抽签；中签者发帖窗口 = draw_date + 1天18小时（即次日 18:00，下一轮抽签前）。
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo("Asia/Shanghai")
DRAW_HOUR = 18


def now_shanghai() -> datetime:
    """当前北京时间，naive（与库里存的 naive datetime 可直接比较）。"""
    return datetime.now(SHANGHAI).replace(tzinfo=None)


def day_start(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, dt.day)


def current_draw_date(now: datetime | None = None) -> datetime:
    """当前「活跃」轮次：18:00 前是昨天那轮（发帖窗口仍开），18:00 后是今天这轮。"""
    now = now or now_shanghai()
    today = day_start(now)
    return today if now.hour >= DRAW_HOUR else today - timedelta(days=1)


def next_draw_date(now: datetime | None = None) -> datetime:
    """下一轮（报名进入的那轮）：18:00 前是今晚，18:00 后是明晚。"""
    now = now or now_shanghai()
    today = day_start(now)
    return today + timedelta(days=1) if now.hour >= DRAW_HOUR else today


def draw_date_for_run(now: datetime | None = None) -> datetime:
    """抽签任务真正要开奖的轮次。

    定时任务预定在 18:00 触发，但 GitHub Actions 经常延迟（几分钟到几小时），
    只会晚不会早。所以：
      - 当天 18:00 之后触发 → 开当天这轮（正常路径，含延迟到 23:59）
      - 延迟跨过午夜、在次日 18:00 前才触发 → 仍然开【昨天】那轮，
        而不是去抽次日那轮（那是给明晚准备的名单）。
    即与 current_draw_date 一致：始终开「当前活跃轮次」。
    """
    return current_draw_date(now)


def post_deadline(draw_date: datetime) -> datetime:
    """中签者发帖截止时间：次日 18:00，下一轮抽签开始前。"""
    return draw_date + timedelta(days=1, hours=DRAW_HOUR)


def to_iso_shanghai(dt: datetime) -> str:
    """把 naive 的北京时间序列化成带 +08:00 偏移的 ISO 串。

    库里存的是 naive datetime。若直接 .isoformat() 下发，前端 dayjs 会按
    「设备本地时区」解析——用户手机在东京(UTC+9)就会把 18:00 当成东京的 18:00，
    倒计时整体偏 1 小时。必须显式带上偏移，让前端无论在哪个时区都算出同一个瞬间。
    """
    return dt.replace(tzinfo=SHANGHAI).isoformat()


def round_range(draw_date: datetime) -> tuple[datetime, datetime]:
    """某轮次对应的 [start, end) 区间，用于按 draw_date 过滤。"""
    return draw_date, draw_date + timedelta(days=1)
