import { describeBrowserFailure } from "./monitorLog.ts";
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
  nextCheckAtMs: number | null;
  countdownTotalMs: number | null;
  intervalSeconds: number;
  rows: Pick<TargetState, "availability">[];
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
      ? { tone: "failed", label: "浏览器未连接", countdown: `${seconds} 秒后重试`, progress }
      : { tone: "failed", label: "浏览器未连接", countdown: "正在重新连接", progress: null };
  }
  if (!seconds) {
    return { tone: "running", label: "正在查询", countdown: `间隔 ${input.intervalSeconds} 秒`, progress: null };
  }
  if (input.cooling) return { tone: "cooling", label: "保护冷却中", countdown: `${seconds} 秒后检查`, progress };
  return { tone: "running", label: "监控中", countdown: `${seconds} 秒后检查`, progress };
}
