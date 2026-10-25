import packageInfo from "../../package.json";
import { Pause, Play, RefreshCw, ShoppingCart } from "lucide-react";

import { BrandMark, GithubBrandIcon, XBrandIcon } from "@/components/BrandIcons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeRun, type RunStatus, type RunTone } from "@/lib/runStatus";
import type { UiState } from "@/lib/store";
import { openAuthorPage, openProjectPage, startWatching, stopWatching } from "@/lib/store";
import { cn } from "@/lib/utils";

const RUN_DOT: Record<RunTone, string> = {
  paused: "bg-muted-foreground/45",
  running: "bg-in-stock",
  cooling: "bg-unknown",
  failed: "bg-destructive",
};

const RUN_FILL: Record<RunTone, string> = {
  paused: "bg-muted-foreground/40",
  running: "bg-primary",
  cooling: "bg-unknown",
  failed: "bg-destructive",
};

/**
 * 距离下一次检查的进度条。
 *
 * 时钟每秒才更新一次，宽度用 1 秒的线性过渡把两次更新连起来，看起来是连续走动的；
 * 每一段等待用下一轮时间做 key 重新挂载，新一轮开始时不会从满格倒着缩回去。
 * 还没有下一轮时间（正在查询、正在重连）时改为来回滑动的不定进度。
 */
function RunProgress({ status, resetKey }: { status: RunStatus; resetKey: number | null }) {
  const percent = status.progress === null ? null : Math.round(status.progress * 1000) / 10;
  return (
    <div
      role="progressbar"
      aria-label="距离下一次检查"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={status.countdown ?? undefined}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
    >
      {percent === null ? (
        <div className={cn("progress-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full", RUN_FILL[status.tone])} />
      ) : (
        <div
          key={resetKey ?? "none"}
          className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", RUN_FILL[status.tone])}
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

export function AppHeader({
  ui,
  clockMs,
  isRetrying,
  onRetryNow,
  onShowCheckout,
}: {
  ui: UiState;
  clockMs: number;
  isRetrying: boolean;
  onRetryNow: () => void;
  onShowCheckout: () => void;
}) {
  const run = describeRun({
    running: ui.running,
    cooling: ui.cooling,
    nextCheckAtMs: ui.nextCheckAtMs,
    countdownTotalMs: ui.countdownTotalMs,
    intervalSeconds: ui.settings.intervalSeconds,
    rows: ui.rows,
  }, clockMs);
  const checkout = ui.settings.checkout;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <BrandMark className="size-7" />
        <h1 className="text-[15px] font-semibold tracking-tight">拾果</h1>
        <span className="text-xs text-muted-foreground tabular-nums max-[1000px]:hidden">v{packageInfo.version}</span>
      </div>

      <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 max-w-sm flex-1 items-center gap-2.5 text-[13px]">
          <span className={cn("size-2 shrink-0 rounded-full", RUN_DOT[run.tone])} aria-hidden="true" />
          {/* 只播报状态变化；每秒变化的剩余时间放在进度条的 aria-valuetext 里，按需读取。 */}
          <span
            role="status"
            aria-live="polite"
            className={cn("shrink-0 font-medium whitespace-nowrap", run.tone === "paused" && "text-muted-foreground")}
          >
            {run.label}
          </span>
          {run.tone !== "paused" ? (
            <>
              <div className="min-w-12 flex-1">
                <RunProgress status={run} resetKey={ui.nextCheckAtMs} />
              </div>
              <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums" aria-hidden="true">
                {run.countdown}
              </span>
            </>
          ) : null}
        </div>

        {checkout.enabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onShowCheckout}
                className={cn(
                  "ml-1 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                  checkout.placeOrder
                    ? "bg-unknown/15 text-unknown-text hover:bg-unknown/25"
                    : "bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                <ShoppingCart className="size-3.5" aria-hidden="true" />
                {checkout.placeOrder ? "自动结账 · 会自动下单" : "自动结账已开启"}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              {checkout.placeOrder
                ? "到货后会走完结账并自动点「立即下单」，生成真实订单；付款仍需你自己完成。点击查看设置。"
                : "到货后会走完结账页面，停在「查看订单」页等你确认。点击查看设置。"}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {ui.running && ui.cooling ? (
          <Button variant="outline" size="sm" onClick={onRetryNow} disabled={isRetrying} aria-busy={isRetrying}>
            <RefreshCw className={isRetrying ? "animate-spin" : undefined} aria-hidden="true" />
            {isRetrying ? "正在重试" : "立即重试"}
          </Button>
        ) : null}
        {ui.running ? (
          <Button variant="secondary" size="sm" className="min-w-20" onClick={() => void stopWatching()}>
            <Pause aria-hidden="true" /> 暂停
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* 禁用的按钮收不到悬停事件，包一层才能在没有监控项时给出提示。 */}
              <span tabIndex={ui.rows.length === 0 ? 0 : undefined}>
                <Button size="sm" className="min-w-24" onClick={() => void startWatching()} disabled={ui.rows.length === 0}>
                  <Play aria-hidden="true" /> 开始监控
                </Button>
              </span>
            </TooltipTrigger>
            {ui.rows.length === 0 ? <TooltipContent>先添加至少一条监控</TooltipContent> : null}
          </Tooltip>
        )}

        <div className="ml-1 flex items-center" aria-label="项目链接">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="在 GitHub 查看开源项目并下载最新版"
                onClick={() => void openProjectPage()}
              >
                <GithubBrandIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>本软件已开源，欢迎在 GitHub 下载最新版体验</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                aria-label="在 X 关注 @suversal，获取更多信息"
                onClick={() => void openAuthorPage()}
              >
                <XBrandIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>关注 @suversal 获取更多信息</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
