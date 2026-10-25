import packageInfo from "../../package.json";
import { Pause, Play, Radar, RefreshCw, ShoppingCart } from "lucide-react";

import { GithubBrandIcon, XBrandIcon } from "@/components/BrandIcons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UiState } from "@/lib/store";
import { openAuthorPage, openProjectPage, startWatching, stopWatching } from "@/lib/store";
import { describeBrowserFailure } from "@/lib/monitorLog";
import { cn } from "@/lib/utils";

type RunTone = "paused" | "running" | "cooling" | "failed";

const RUN_DOT: Record<RunTone, string> = {
  paused: "bg-muted-foreground/45",
  running: "bg-in-stock",
  cooling: "bg-unknown",
  failed: "bg-destructive",
};

/** 运行状态一句话：只说现在在做什么、下一次什么时候查，不换行。 */
function describeRun(ui: UiState, clockMs: number): { tone: RunTone; label: string } {
  if (!ui.running) return { tone: "paused", label: "已暂停" };
  const seconds = ui.nextCheckAtMs ? Math.max(0, Math.ceil((ui.nextCheckAtMs - clockMs) / 1_000)) : null;
  if (describeBrowserFailure(ui.rows) !== null) {
    return {
      tone: "failed",
      label: seconds ? `浏览器未连接 · 约 ${seconds} 秒后重试` : "浏览器未连接 · 正在重新连接",
    };
  }
  if (seconds === null || seconds === 0) {
    return { tone: "running", label: `正在查询 · 间隔 ${ui.settings.intervalSeconds} 秒` };
  }
  if (ui.cooling) return { tone: "cooling", label: `保护冷却中 · 约 ${seconds} 秒后检查` };
  return { tone: "running", label: `监控中 · 约 ${seconds} 秒后检查` };
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
  const run = describeRun(ui, clockMs);
  const checkout = ui.settings.checkout;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <Radar className="size-[18px]" strokeWidth={2} />
        </div>
        <h1 className="text-[15px] font-semibold tracking-tight">拾果</h1>
        <span className="text-xs text-muted-foreground tabular-nums max-[1000px]:hidden">v{packageInfo.version}</span>
      </div>

      <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px]" role="status" aria-live="polite">
          <span className="relative flex size-2 shrink-0" aria-hidden="true">
            {run.tone === "running" ? (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-in-stock opacity-40 motion-reduce:hidden" />
            ) : null}
            <span className={cn("relative inline-flex size-2 rounded-full", RUN_DOT[run.tone])} />
          </span>
          <span className={cn("truncate font-medium tabular-nums", run.tone === "paused" && "text-muted-foreground")}>{run.label}</span>
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
