import dayjs from 'dayjs';

export const COUNTDOWN_EXPIRED = '已截止';

/**
 * 把「距截止还剩多久」格式化成中文文案。
 *
 * 注意不要用 dayjs().diff(deadline, 'hour')：它向下取整，剩 40 分钟会算成 0 小时，
 * 从而误判成「已截止」——而后端此刻其实还收帖（post.py 只在 now >= deadline 才拒）。
 * 中签者看到「已截止」就会放弃发帖，那天的帖子就永久空缺了。
 *
 * 返回 null 表示没有有效的截止时间（不该显示倒计时）。
 */
export function formatCountdown(
  deadlineIso?: string | null,
  now?: dayjs.ConfigType
): string | null {
  if (!deadlineIso) return null;
  const deadline = dayjs(deadlineIso);
  if (!deadline.isValid()) return null;

  const totalMinutes = deadline.diff(now === undefined ? dayjs() : dayjs(now), 'minute');
  if (totalMinutes <= 0) return COUNTDOWN_EXPIRED;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}分钟`;
  if (minutes === 0) return `${hours}小时`;
  return `${hours}小时${minutes}分`;
}
