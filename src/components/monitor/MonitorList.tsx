import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ListFilter, LoaderCircle, Plus, Trash2 } from "lucide-react";

import { BrandMark } from "@/components/BrandIcons";
import { AddMonitorDialog } from "@/components/monitor/AddMonitorDialog";
import { ProductBarkRoute } from "@/components/monitor/ProductBarkRoute";
import { DeliverySummary, StatusChip } from "@/components/monitor/StatusChip";
import { WatchBandPicker } from "@/components/monitor/WatchBandPicker";
import { compactProductName } from "@/components/monitor/productNames";
import { Button } from "@/components/ui/button";
import type { UiState } from "@/lib/store";
import { openTargetProduct, removeTarget } from "@/lib/store";
import {
  countByFilter,
  filterGroups,
  groupMonitorsByProduct,
  type MonitorFilter,
} from "@/lib/monitorGroups";
import { describeRowSighting, latestSightings } from "@/lib/sightings";
import { formatTime, targetKey, type Target } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: MonitorFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "inStock", label: "有货" },
  { value: "unavailable", label: "不可取货" },
  { value: "untrusted", label: "未确认" },
];

function FilterBar({
  value,
  counts,
  onChange,
}: {
  value: MonitorFilter;
  counts: Record<MonitorFilter, number>;
  onChange: (value: MonitorFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="按状态筛选监控">
      {FILTERS.map((filter) => {
        const count = counts[filter.value];
        const active = value === filter.value;
        const emphasis = count > 0 && !active
          ? filter.value === "inStock"
            ? "text-in-stock"
            : filter.value === "untrusted"
              ? "text-unknown-text"
              : ""
          : "";
        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {filter.label}
            <span className={cn("tabular-nums", active ? "opacity-75" : emphasis)}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ ready, onAdd }: { ready: boolean; onAdd: () => void }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
      {ready ? (
        <BrandMark className="mb-4 size-12" />
      ) : (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-semibold">{ready ? "还没有监控项目" : "正在载入目录…"}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {ready
          ? "选择要追踪的门店和型号，添加后点击「开始监控」。"
          : "正在连接本地监控引擎，请稍候。"}
      </p>
      {ready ? (
        <Button className="mt-5" onClick={onAdd}>
          <Plus aria-hidden="true" /> 添加监控
        </Button>
      ) : null}
    </div>
  );
}

export function MonitorList({ ui, nowMs }: { ui: UiState; nowMs: number }) {
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<MonitorFilter>("all");
  const [removingTargetKeys, setRemovingTargetKeys] = useState<Set<string>>(() => new Set());
  const [removeError, setRemoveError] = useState<string | null>(null);

  const targets = useMemo(() => ui.rows.map((row) => row.target), [ui.rows]);
  // 统一送货地址只作用于中国大陆的监控；其他地区和未设置地址时，送货日期按门店各自估算。
  const hasDeliveryRegion = ui.settings.deliveryRegion !== null;
  const groups = useMemo(
    () => groupMonitorsByProduct(ui.rows, { sharedDeliveryLocales: new Set(hasDeliveryRegion ? ["zh_CN"] : []) }),
    [ui.rows, hasDeliveryRegion],
  );
  // 型号标题里的门店数和有货数按整组统计，不随筛选变化。
  const groupTotals = useMemo(() => new Map(groups.map((group) => [group.key, {
    stores: group.rows.length,
    inStock: group.rows.filter((row) => row.availability.kind === "in_stock").length,
  }])), [groups]);
  const counts = useMemo(() => countByFilter(ui.rows), [ui.rows]);
  // 每个门店最近一段到货：正在有货从几点起，或者上次有货是什么时候。
  const sightings = useMemo(() => latestSightings(ui.stockHistory, ui.rows), [ui.stockHistory, ui.rows]);
  // 当前筛选项被清空（例如有货的那一项恢复成无货）时回到全部，免得列表莫名变空；
  // 同时重置筛选本身，之后再出现同类状态时不会自己又切回去。
  const activeFilter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  useEffect(() => {
    if (activeFilter !== filter) setFilter(activeFilter);
  }, [activeFilter, filter]);
  const visibleGroups = useMemo(() => filterGroups(groups, activeFilter), [groups, activeFilter]);
  const multipleRegions = useMemo(() => new Set(targets.map((target) => target.locale)).size > 1, [targets]);
  const regionTitles = useMemo(() => new Map(ui.regions.map((region) => [region.locale, region.title])), [ui.regions]);
  const defaultCompanionParts = useMemo(
    () => new Map(ui.products.map((product) => [product.partNumber, product.companionPart])),
    [ui.products],
  );

  async function onRemove(target: Target) {
    const key = targetKey(target);
    setRemoveError(null);
    setRemovingTargetKeys((current) => new Set(current).add(key));
    try {
      const removed = await removeTarget(target);
      if (!removed) {
        setRemoveError(`未能删除“${compactProductName(target.productName)}”，请查看活动日志中的具体原因后重试。`);
      }
    } finally {
      setRemovingTargetKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <section className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-labelledby="monitor-list-title">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <h2 id="monitor-list-title" className="text-sm font-semibold">监控列表</h2>
        {ui.rows.length > 0 ? (
          <FilterBar value={activeFilter} counts={counts} onChange={setFilter} />
        ) : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAddOpen(true)} disabled={!ui.ready}>
          <Plus aria-hidden="true" /> 添加监控
        </Button>
      </div>

      {removeError ? (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/8 px-4 py-2.5 text-xs leading-5 text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{removeError}</span>
        </div>
      ) : null}

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {ui.rows.length === 0 ? (
          <EmptyState ready={ui.ready} onAdd={() => setAddOpen(true)} />
        ) : visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
            <ListFilter className="size-5" aria-hidden="true" />
            没有符合筛选条件的监控
            <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>显示全部</Button>
          </div>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-[10.5rem]" />
              <col />
              <col className="w-24" />
              <col className="w-12" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="h-9 border-b border-border pl-4 text-left font-medium">取货状态</th>
                <th scope="col" className="h-9 border-b border-border px-3 text-left font-medium">门店</th>
                <th scope="col" className="h-9 border-b border-border px-3 text-right font-medium">最后检查</th>
                <th scope="col" className="h-9 border-b border-border">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            {visibleGroups.map((group) => {
              const target = group.target;
              const totals = groupTotals.get(group.key) ?? { stores: group.rows.length, inStock: 0 };
              return (
                <tbody key={group.key}>
                  <tr>
                    <th scope="rowgroup" colSpan={4} className="border-b border-border bg-muted/50 px-4 py-2 text-left font-normal">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <button
                              type="button"
                              className="min-w-0 text-left text-[13px] leading-5 font-semibold break-words hover:text-primary hover:underline"
                              title={`${target.productName}（点击打开商品页）`}
                              aria-label={`打开商品页：${target.productName}`}
                              onClick={() => void openTargetProduct(target)}
                            >
                              {compactProductName(target.productName)}
                            </button>
                            {multipleRegions ? (
                              <span className="rounded border border-border px-1.5 text-[11px] leading-4 text-muted-foreground">
                                {regionTitles.get(target.locale) ?? target.locale}
                              </span>
                            ) : null}
                            <span className="text-xs whitespace-nowrap text-muted-foreground">
                              {totals.stores} 家门店
                              {totals.inStock > 0 ? <span className="font-medium text-in-stock"> · {totals.inStock} 家有货</span> : null}
                            </span>
                          </div>
                          {target.companionPart && target.kitPart ? (
                            <WatchBandPicker
                              target={target}
                              targets={targets}
                              defaultCompanionPart={defaultCompanionParts.get(target.partNumber)}
                            />
                          ) : null}
                          {group.mixedCompanions ? (
                            <p className="mt-0.5 text-xs leading-5 text-unknown-text">
                              各门店的送货表带不一致，送货日期可能对应不同组合；重新选择表带会统一应用到全部门店。
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 pt-px">
                          {group.deliveryPerStore ? null : (
                            <DeliverySummary
                              pickupDetails={group.delivery?.pickupDetails}
                              checkedMs={group.delivery?.checkedMs ?? null}
                              // 送货只在取货查询成功后才会查；整组都没拿到可信结果时，缺少送货日期不值得单独提示。
                              expected={target.locale === "zh_CN" && hasDeliveryRegion && group.rows.some((row) => row.availability.kind !== "unknown")}
                            />
                          )}
                          <ProductBarkRoute target={target} customUrl={ui.settings.productBarkUrls[target.partNumber]} />
                        </div>
                      </div>
                    </th>
                  </tr>
                  {group.rows.map((row) => {
                    const rowKey = targetKey(row.target);
                    const removing = removingTargetKeys.has(rowKey);
                    const sighting = sightings.get(rowKey);
                    return (
                      <tr key={rowKey} className="group transition-colors hover:bg-accent/50">
                        <td className="border-b border-border/70 py-2 pl-4">
                          <StatusChip availability={row.availability} pickupDetails={row.pickupDetails} />
                        </td>
                        <td className="border-b border-border/70 px-3 py-2">
                          <div className="truncate" title={`${row.target.storeTitle} [${row.target.storeNumber}]`}>
                            <span className="font-medium">{row.target.storeTitle}</span>
                            <span className="ml-2 text-xs text-muted-foreground tabular-nums">{row.target.storeNumber}</span>
                          </div>
                          {group.deliveryPerStore ? (
                            <div className="mt-0.5 flex min-w-0">
                              <DeliverySummary pickupDetails={row.pickupDetails} checkedMs={row.lastCheckedMs} expected={false} />
                            </div>
                          ) : null}
                          {sighting ? (
                            <p
                              className={cn(
                                "mt-0.5 truncate text-xs text-muted-foreground tabular-nums",
                                sighting.endedMs === undefined && "font-medium text-in-stock",
                              )}
                              title={sighting.pickupQuote}
                            >
                              {describeRowSighting(sighting, nowMs)}
                            </p>
                          ) : null}
                        </td>
                        <td className="border-b border-border/70 px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
                          {formatTime(row.lastCheckedMs)}
                        </td>
                        <td className="border-b border-border/70 py-2 pr-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive group-hover:text-muted-foreground"
                            aria-label={removing ? "正在删除这条监控" : `删除监控：${row.target.storeTitle} · ${compactProductName(row.target.productName)}`}
                            title="删除这条监控"
                            aria-busy={removing}
                            disabled={removing}
                            onClick={() => void onRemove(row.target)}
                          >
                            {removing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}
      </div>

      <AddMonitorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        regions={ui.regions}
        categories={ui.categories}
        category={ui.category}
        locale={ui.settings.locale}
        stores={ui.stores}
        products={ui.products}
        targets={targets}
        refreshing={ui.refreshing}
      />
    </section>
  );
}
