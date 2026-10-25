import type { TargetState } from "./types.ts";

/**
 * 一次监控（从点「开始监控」到暂停）的查询统计。
 *
 * 轮数取自引擎的轮次编号，引擎每次开始监控都从 1 重新计，界面中途刷新也不会错；
 * 请求数和有货次数由界面逐轮累加，只在本机界面里，不落盘。
 */
export interface MonitorSession {
  /** 点「开始监控」的时间；界面打开时引擎已经在跑则不知道，为 null。 */
  startedAtMs: number | null;
  /** 暂停的时间；运行中为 null。 */
  endedAtMs: number | null;
  /** 本次监控已完成的查询轮数。 */
  cycles: number;
  /** 实际发往 Apple 的请求数，同地区复用的响应不计入。 */
  requests: number;
  /** 查到有货的次数：每轮每个有货的监控项记一次。 */
  hits: number;
}

export function startSession(nowMs: number): MonitorSession {
  return { startedAtMs: nowMs, endedAtMs: null, cycles: 0, requests: 0, hits: 0 };
}

/** 界面打开时引擎已经在跑：从下一轮开始累计请求和有货，轮数仍以引擎为准。 */
export function joinSession(): MonitorSession {
  return { startedAtMs: null, endedAtMs: null, cycles: 0, requests: 0, hits: 0 };
}

export function endSession(session: MonitorSession, nowMs: number): MonitorSession {
  return { ...session, endedAtMs: session.endedAtMs ?? nowMs };
}

export function recordCycle(
  session: MonitorSession | null,
  cycle: { cycle: number; requestCount: number; snapshot: Pick<TargetState, "availability">[] },
): MonitorSession {
  const base = session ?? joinSession();
  return {
    ...base,
    cycles: Math.max(base.cycles, cycle.cycle),
    requests: base.requests + cycle.requestCount,
    hits: base.hits + cycle.snapshot.filter((row) => row.availability.kind === "in_stock").length,
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${seconds % 60} 秒`;
  return `${seconds} 秒`;
}

function clock(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 悬浮说明：这次监控从什么时候开始、跑了多久、查了多少。 */
export function describeSession(session: MonitorSession, nowMs: number): string {
  const counts = `查询 ${session.cycles} 轮，向 Apple 发出 ${session.requests} 次请求，发现有货 ${session.hits} 次。`;
  if (session.startedAtMs === null) {
    return `本次监控${session.endedAtMs === null ? "" : "（已暂停）"}：${counts}请求和有货次数从界面打开后开始统计。`;
  }
  const end = session.endedAtMs ?? nowMs;
  const span = `${clock(session.startedAtMs)} 开始，${session.endedAtMs === null ? "已运行" : "共运行"} ${formatDuration(end - session.startedAtMs)}`;
  return `本次监控（${span}${session.endedAtMs === null ? "" : "，已暂停"}）：${counts}再次开始监控会重新计数。`;
}
