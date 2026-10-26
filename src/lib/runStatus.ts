import { describeBrowserFailure } from "./monitorLog.ts";
import { formatDuration } from "./monitorSession.ts";
import type { TargetState } from "./types.ts";

export type RunTone = "paused" | "running" | "cooling" | "failed";

/** 顶栏的运行状态：一个短标签、一句倒计时说明，以及到下一次检查的进度。 */
export interface RunStatus {
  tone: RunTone;
  label: string;
  /** 倒计时说明，例如「12 秒后检查」；暂停时为 null。 */
  countdown: string | null;
  /** 这一段等待已走过的比例（0–1）；正在查询或正在重连时为 null，显示为不定进度。 */
  progress: number | null;
}

export interface RunInput {
  running: boolean;
  cooling: boolean;
  /** 下一次是定点查询。 */
  alignedCheck: boolean;
  /** 只做定点查询：不按查询间隔，正在查询时也就不提间隔。 */
  alignedOnly: boolean;
  nextCheckAtMs: number | null;
  countdownTotalMs: number | null;
  intervalSeconds: number;
  rows: Pick<TargetState, "availability">[];
}

/** 等待时长：一分钟以内只说秒数，更长的按分、秒说，放慢探测时不必数几百秒。 */
export function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} 秒` : formatDuration(seconds * 1_000);
}

/** 定点查询落在整点、半点还是其他勾选的分钟。 */
function markWord(atMs: number): string {
  const minute = new Date(atMs).getMinutes();
  if (minute === 0) return "整点";
  if (minute === 30) return "半点";
  return "定点";
}

/** 定点查询的那一刻，例如「12:00 整点查询」「06:30 半点查询」「12:15 定点查询」。 */
export function describeMark(atMs: number): string {
  const at = new Date(atMs);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${time} ${markWord(atMs)}查询`;
}

export function describeRun(input: RunInput, nowMs: number): RunStatus {
  if (!input.running) return { tone: "paused", label: "已暂停", countdown: null, progress: null };

  const remainingMs = input.nextCheckAtMs === null ? null : Math.max(0, input.nextCheckAtMs - nowMs);
  const seconds = remainingMs === null ? null : Math.ceil(remainingMs / 1_000);
  // 正常情况下总时长随每轮结果一起到达；万一缺了，至少按查询间隔估算，进度不会倒退。
  const totalMs = input.countdownTotalMs ?? (remainingMs === null ? null : Math.max(remainingMs, input.intervalSeconds * 1_000));
  const progress = remainingMs !== null && totalMs ? Math.min(1, Math.max(0, 1 - remainingMs / totalMs)) : null;

  if (describeBrowserFailure(input.rows) !== null) {
    return seconds
      ? { tone: "failed", label: "浏览器未连接", countdown: `${formatWait(seconds)}后重试`, progress }
      : { tone: "failed", label: "浏览器未连接", countdown: "正在重新连接", progress: null };
  }
  if (!seconds) {
    const pace = input.alignedOnly ? "只做定点查询" : `间隔 ${input.intervalSeconds} 秒`;
    return { tone: "running", label: "正在查询", countdown: pace, progress: null };
  }
  if (input.cooling) return { tone: "cooling", label: "保护冷却中", countdown: `${formatWait(seconds)}后检查`, progress };
  const mark = input.alignedCheck && input.nextCheckAtMs !== null ? markWord(input.nextCheckAtMs) : "";
  return { tone: "running", label: "监控中", countdown: `${formatWait(seconds)}后${mark}检查`, progress };
}
