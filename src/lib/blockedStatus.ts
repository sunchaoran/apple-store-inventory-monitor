import type { BlockedRoute } from "./types.ts";

/** 告警里关于被拒出口的说明：走的哪个出口、被拦了多久、程序接下来怎么做。 */
export interface BlockedSummary {
  /** 例如「线路：系统代理 127.0.0.1:6152」。 */
  route: string;
  /** 例如「自 23:15 起已被拦截 47 分钟，连续 9 次请求被拒」。 */
  streak: string;
  /** 已放慢探测时说明下一次探测的时间；没有放慢或已暂停时为 null。 */
  plan: string | null;
}

export interface BlockedRun {
  running: boolean;
  cooling: boolean;
  nextCheckAtMs: number | null;
}

/**
 * 时长按分钟取整：告警是 role="alert"，每秒改一次字会被读屏反复播报，
 * 精确到秒的倒计时已经在顶栏进度条里。
 */
export function describeBlocked(blocked: BlockedRoute, run: BlockedRun, nowMs: number): BlockedSummary {
  const since = formatMoment(blocked.sinceMs, nowMs);
  const streak = run.running
    ? `自 ${since} 起${describeElapsed(nowMs - blocked.sinceMs)}，连续 ${blocked.rejections} 次请求被拒`
    : `自 ${since} 起连续 ${blocked.rejections} 次请求被拒，监控已暂停`;
  const plan =
    run.running && run.cooling && run.nextCheckAtMs !== null
      ? `已自动放慢探测，约 ${Math.max(1, Math.ceil((run.nextCheckAtMs - nowMs) / 60_000))} 分钟后再试；拿到一次正常响应就恢复原来的查询间隔。`
      : null;
  return { route: `线路：${blocked.route}`, streak, plan };
}

function describeElapsed(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "已被拦截不到 1 分钟";
  if (minutes < 60) return `已被拦截 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `已被拦截 ${hours} 小时` : `已被拦截 ${hours} 小时 ${minutes % 60} 分钟`;
}

/** 当天只写时刻，跨天时带上日期，免得把昨晚的 23:15 看成今晚。 */
export function formatMoment(ms: number, nowMs: number): string {
  const at = new Date(ms);
  const now = new Date(nowMs);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return sameDay ? time : `${at.getMonth() + 1} 月 ${at.getDate()} 日 ${time}`;
}
