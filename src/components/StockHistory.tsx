import { compactProductName } from "@/components/monitor/productNames";
import { clockTime, describeSpan, groupByDay } from "@/lib/sightings";
import { targetKey, type SightingRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 到货记录：每段连续有货一条，新的在前，按天分组。
 *
 * 时刻带秒，方便看定点查询是不是刚好抓到；持续多久代替 Apple 不给的库存数量。
 */
export function StockHistory({ records, nowMs }: { records: SightingRecord[]; nowMs: number }) {
  if (records.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-xs leading-5 text-muted-foreground">
        还没有到货记录。查到有货时，这里会记下几点有货、持续多久。
      </p>
    );
  }
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 pb-3">
      {groupByDay(records, nowMs).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="sticky top-0 z-10 bg-card pt-3 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</h3>
          <ol className="space-y-2.5">
            {group.records.map(({ target, sighting }) => {
              const ongoing = sighting.endedMs === undefined;
              return (
                <li
                  key={`${targetKey(target)}|${sighting.sinceMs}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3"
                  title={sighting.pickupQuote}
                >
                  <time
                    dateTime={new Date(sighting.sinceMs).toISOString()}
                    className={cn(
                      "font-mono text-xs leading-5 tabular-nums",
                      ongoing ? "font-semibold text-in-stock" : "text-muted-foreground",
                    )}
                  >
                    {clockTime(sighting.sinceMs, true)}
                  </time>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] leading-5 font-medium" title={target.productName}>
                      {compactProductName(target.productName)}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {target.storeTitle}
                      <span className="ml-1.5 tabular-nums">{target.storeNumber}</span>
                      <span aria-hidden="true"> · </span>
                      <span className={ongoing ? "font-medium text-in-stock" : undefined}>{describeSpan(sighting, nowMs)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
