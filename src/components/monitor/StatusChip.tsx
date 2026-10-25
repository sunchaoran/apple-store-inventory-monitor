import { AlertTriangle, Check, Truck } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeDelivery, describeMonitorStatus, describePickupDate, type DeliveryTone } from "@/lib/monitorLog";
import type { Availability, PickupDetails, StatusTone } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 状态色只落在圆点和浅色底上，文字保持前景色，深浅主题下都有足够对比度。
 * 「有货」是唯一需要立刻行动的状态，用实心底；「未确认」用琥珀色文字提醒别当成无货。
 */
const TONE_CHIP: Record<StatusTone, string> = {
  inStock: "border-transparent bg-in-stock font-semibold text-in-stock-foreground",
  outOfStock: "border-transparent bg-muted text-foreground/75",
  pickupUnsupported: "border-transparent bg-pickup-unsupported/12 text-foreground/85",
  notForSale: "border-transparent bg-not-for-sale/14 text-foreground/85",
  presale: "border-transparent bg-presale/12 text-foreground/85",
  comingSoon: "border-transparent bg-coming-soon/12 text-foreground/85",
  unknown: "border-transparent bg-unknown/15 font-medium text-unknown-text",
  pending: "border-dashed border-border bg-transparent text-muted-foreground",
};

const TONE_DOT: Record<Exclude<StatusTone, "inStock" | "unknown">, string> = {
  outOfStock: "bg-out-of-stock",
  pickupUnsupported: "bg-pickup-unsupported",
  notForSale: "bg-not-for-sale",
  presale: "bg-presale",
  comingSoon: "bg-coming-soon",
  pending: "border border-muted-foreground/60",
};

function ToneMark({ tone }: { tone: StatusTone }) {
  if (tone === "inStock") return <Check className="size-3.5" strokeWidth={2.75} aria-hidden="true" />;
  if (tone === "unknown") return <AlertTriangle className="size-3.5" aria-hidden="true" />;
  return <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden="true" />;
}

export function StatusChip({ availability, pickupDetails }: { availability: Availability; pickupDetails?: PickupDetails }) {
  const { label, tone, detail } = describeMonitorStatus({ availability, pickupDetails });
  const pickupDate = availability.kind === "in_stock" ? describePickupDate(pickupDetails?.pickupQuote) : null;
  const content = (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      <span className={cn("inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap", TONE_CHIP[tone])}>
        <ToneMark tone={tone} />
        <span className="truncate">{label}</span>
      </span>
      {pickupDate ? <span className="text-xs font-medium whitespace-nowrap text-in-stock tabular-nums">{pickupDate} 可取</span> : null}
    </span>
  );
  if (!detail) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex max-w-full cursor-help">{content}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-90">{detail}</TooltipContent>
    </Tooltip>
  );
}

/** 只有一两天内能送到的日期需要强调；较晚的日期和无法识别的说明退到次要颜色。 */
const DELIVERY_TEXT: Record<DeliveryTone, string> = {
  fast: "text-in-stock",
  soon: "text-foreground",
  standard: "text-foreground",
  later: "text-muted-foreground",
  unavailable: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

export function DeliverySummary({
  pickupDetails,
  checkedMs,
  expected,
}: {
  pickupDetails?: PickupDetails;
  checkedMs: number | null;
  /** 已设置送货地区、应当有送货结果时，缺失也要说明；否则不占位置。 */
  expected: boolean;
}) {
  const delivery = describeDelivery(pickupDetails, checkedMs);
  if (!delivery) {
    return expected ? (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground" title="Apple 本轮未返回预计送货时间">
        <Truck className="size-3.5" aria-hidden="true" />
        送货未返回
      </span>
    ) : null;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex max-w-56 min-w-0 cursor-help items-center gap-1.5 text-xs"
          aria-label={`预计送货：${delivery.detail}；${delivery.timing}`}
        >
          <Truck className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn("truncate font-medium tabular-nums", DELIVERY_TEXT[delivery.tone])}>{delivery.label}</span>
          {/* 没有具体日期时，速度提示只是一句通用说明，完整原文在悬浮提示里。 */}
          {delivery.tone !== "unknown" && delivery.tone !== "unavailable" ? (
            <span className="whitespace-nowrap text-muted-foreground">{delivery.timing}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-90">Apple 预计送货：{delivery.detail}</TooltipContent>
    </Tooltip>
  );
}
