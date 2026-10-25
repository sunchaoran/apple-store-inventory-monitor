import { assertNever, isUntrusted, type Availability, type PickupDetails, type Target, type TargetState } from "./types.ts";
import { sortMonitorsNewestFirst } from "./productOrder.ts";

/**
 * 监控列表按型号分组：同一型号在多家门店的监控项排在一起。
 *
 * 型号专属 Bark 和 Watch 送货表带本来就是按型号共享的，跟门店无关，放在型号
 * 这一级只显示一次；门店这一级只剩取货状态和检查时间，一眼能比较同一台机器在
 * 各家门店的情况。送货日期要看情况：设置了统一送货地址时各门店共用一份结果，
 * 没有时 Apple 按各门店所在地区分别估算，只能逐店显示。
 */
export interface MonitorGroup {
  /** 与 Watch 表带、专属 Bark 的作用范围一致：同一地区的同一零件号。 */
  key: string;
  /** 组内第一条监控的目标，型号名称、表带等型号级信息取自它。 */
  target: Target;
  rows: TargetState[];
  /** 整组共用的送货说明（取最近一次带回的）；各门店不一致或还没有时为 null。 */
  delivery: { pickupDetails: PickupDetails; checkedMs: number | null } | null;
  /** 送货日期因门店而异，需要在门店行分别显示。 */
  deliveryPerStore: boolean;
  /** 组内门店用的送货表带不一致，例如后来加入的门店沿用了目录默认表带。 */
  mixedCompanions: boolean;
}

export interface GroupOptions {
  /** 已设置统一送货地址的地区：这些地区的送货结果按型号共享，与门店无关。 */
  sharedDeliveryLocales?: ReadonlySet<string>;
}

export function groupMonitorsByProduct(rows: readonly TargetState[], options: GroupOptions = {}): MonitorGroup[] {
  const groups = new Map<string, MonitorGroup>();
  // 先按新款优先排好，分组沿用首次出现的顺序，组内门店顺序也随之稳定。
  for (const row of sortMonitorsNewestFirst(rows)) {
    const key = `${row.target.locale}|${row.target.partNumber}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, target: row.target, rows: [], delivery: null, deliveryPerStore: false, mixedCompanions: false };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  for (const group of groups.values()) {
    group.mixedCompanions = new Set(group.rows.map((row) => row.target.companionPart ?? "")).size > 1;

    let latest: MonitorGroup["delivery"] = null;
    for (const row of group.rows) {
      const details = row.pickupDetails;
      if (details?.saleMessage && (latest === null || (row.lastCheckedMs ?? 0) > (latest.checkedMs ?? 0))) {
        latest = { pickupDetails: details, checkedMs: row.lastCheckedMs };
      }
    }
    if (latest === null) continue;

    const shared = options.sharedDeliveryLocales?.has(group.target.locale) ?? false;
    // 没有统一送货地址时，只有每家门店都带回了一模一样的说明，才能合并成一条；
    // 有门店还没结果时不能拿别家的日期替它说话。
    const messages = group.rows.map((row) => row.pickupDetails?.saleMessage ?? "");
    const uniform = messages.every(Boolean) && new Set(messages).size === 1;
    if (shared || uniform) group.delivery = latest;
    else group.deliveryPerStore = true;
  }
  return [...groups.values()];
}

export type MonitorFilter = "all" | "inStock" | "unavailable" | "untrusted";

/**
 * 概览与筛选共用同一套口径：「不可取货」包括无货、不支持取货及尚不可购买，
 * 「未确认」只算本轮没有可信结论的项；待查询、待开放取货只出现在「全部」里。
 */
export function matchesFilter(availability: Availability, filter: MonitorFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "inStock":
      return availability.kind === "in_stock";
    case "unavailable":
      return availability.kind === "out_of_stock";
    case "untrusted":
      return isUntrusted(availability);
    default:
      return assertNever(filter);
  }
}

export function countByFilter(rows: readonly Pick<TargetState, "availability">[]): Record<MonitorFilter, number> {
  const counts: Record<MonitorFilter, number> = { all: rows.length, inStock: 0, unavailable: 0, untrusted: 0 };
  for (const row of rows) {
    if (matchesFilter(row.availability, "inStock")) counts.inStock += 1;
    if (matchesFilter(row.availability, "unavailable")) counts.unavailable += 1;
    if (matchesFilter(row.availability, "untrusted")) counts.untrusted += 1;
  }
  return counts;
}

export function filterGroups(groups: readonly MonitorGroup[], filter: MonitorFilter): MonitorGroup[] {
  if (filter === "all") return [...groups];
  return groups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => matchesFilter(row.availability, filter)) }))
    .filter((group) => group.rows.length > 0);
}
