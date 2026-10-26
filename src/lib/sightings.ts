import { targetKey, type Sighting, type SightingRecord, type TargetState } from "./types.ts";

/** 界面里最多留多少条结束的到货记录，与 Rust 侧 `history::MAX_RECORDS` 一致。 */
export const MAX_SIGHTINGS = 200;

type Row = Pick<TargetState, "target" | "sighting">;

function recordKey(record: SightingRecord): string {
  return `${targetKey(record.target)}|${record.sighting.sinceMs}`;
}

/** 把一条结束的记录并进历史：同一段只留一条，按开始时间从旧到新，只保留最近的。 */
export function addSighting(history: SightingRecord[], record: SightingRecord): SightingRecord[] {
  const key = recordKey(record);
  return [...history.filter((item) => recordKey(item) !== key), record]
    .sort((a, b) => a.sighting.sinceMs - b.sighting.sinceMs)
    .slice(-MAX_SIGHTINGS);
}

/**
 * 到货记录列表，新的在前。
 *
 * 历史里只有结束了的；还在有货的那一段、以及刚结束但历史还没送到的，在快照里。
 * 同一段两边都有时以快照为准，它更新。
 */
export function listSightings(history: SightingRecord[], rows: Row[]): SightingRecord[] {
  const merged = new Map(history.map((record) => [recordKey(record), record]));
  for (const row of rows) {
    if (!row.sighting) continue;
    const record = { target: row.target, sighting: row.sighting };
    merged.set(recordKey(record), record);
  }
  return [...merged.values()].sort((a, b) => b.sighting.sinceMs - a.sighting.sinceMs);
}

/** 每个监控项最近一段到货。重启应用后引擎的快照里没有，就从历史里找。 */
export function latestSightings(history: SightingRecord[], rows: Row[]): Map<string, Sighting> {
  const latest = new Map<string, Sighting>();
  for (const { target, sighting } of [...history, ...rows.flatMap((row) => (row.sighting ? [{ target: row.target, sighting: row.sighting }] : []))]) {
    const key = targetKey(target);
    const known = latest.get(key);
    if (!known || sighting.sinceMs >= known.sinceMs) latest.set(key, sighting);
  }
  return latest;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 时刻，例如「12:00」；带秒时「12:00:03」，用来看定点查询是不是刚好抓到。 */
export function clockTime(ms: number, withSeconds = false): string {
  const date = new Date(ms);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${time}:${pad(date.getSeconds())}` : time;
}

/** 「今天」「昨天」，更早的写日期，例如「10月24日」。 */
export function dayLabel(ms: number, nowMs: number): string {
  const startOfDay = (value: number) => {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const days = Math.round((startOfDay(nowMs) - startOfDay(ms)) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  const date = new Date(ms);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 时长按分钟说，比秒数好读：「3 分钟」「1 小时 5 分」。 */
function minutesText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

/** 还在有货时已经多久；不到一分钟不提。 */
function elapsedSuffix(sighting: Sighting, nowMs: number): string {
  const elapsed = nowMs - sighting.sinceMs;
  return elapsed < 60_000 ? "" : `，已 ${minutesText(elapsed)}`;
}

/** 这段到货持续了多久，或者为什么说不准。 */
export function describeSpan(sighting: Sighting, nowMs: number): string {
  if (sighting.endedMs === undefined) return `正在有货${elapsedSuffix(sighting, nowMs)}`;
  if (sighting.interrupted) return "停止查询时仍有货";
  if (sighting.rounds <= 1) return "只查到一次";
  const lasted = sighting.lastSeenMs - sighting.sinceMs;
  return lasted < 60_000 ? "持续不到 1 分钟" : `持续约 ${minutesText(lasted)}`;
}

/** 门店行下面的一句：正在有货从几点起，或者上次有货是什么时候、持续多久。 */
export function describeRowSighting(sighting: Sighting, nowMs: number): string {
  const since = clockTime(sighting.sinceMs);
  return sighting.endedMs === undefined
    ? `${since} 起有货${elapsedSuffix(sighting, nowMs)}`
    : `上次有货 ${dayLabel(sighting.sinceMs, nowMs)} ${since} · ${describeSpan(sighting, nowMs)}`;
}

/** 按开始那天分组，组内保持传入的先后。 */
export function groupByDay(records: SightingRecord[], nowMs: number): { label: string; records: SightingRecord[] }[] {
  const groups: { label: string; records: SightingRecord[] }[] = [];
  for (const record of records) {
    const label = dayLabel(record.sighting.sinceMs, nowMs);
    const last = groups.at(-1);
    if (last?.label === label) last.records.push(record);
    else groups.push({ label, records: [record] });
  }
  return groups;
}
