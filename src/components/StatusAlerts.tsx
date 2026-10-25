import { AlertTriangle, Download, RefreshCw, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { UiState } from "@/lib/store";
import { dismissUpdate, installUpdate, openReleasePage } from "@/lib/store";
import { describeBrowserFailure, describeBrowserRecovery } from "@/lib/monitorLog";
import { describeAdvice } from "@/lib/types";
import { describeUpdateProgress, updatePercent } from "@/lib/updateStatus";

/** 需要用户处理的全局提示：浏览器未连接、结果不可信、发现新版本。 */
export function StatusAlerts({
  ui,
  isRetrying,
  onRetryNow,
}: {
  ui: UiState;
  isRetrying: boolean;
  onRetryNow: () => void;
}) {
  const browserFailure = describeBrowserFailure(ui.rows);
  const hasAlerts = browserFailure !== null || ui.trouble !== null || ui.update !== null;
  if (!hasAlerts) return null;

  return (
    <div className="grid shrink-0 gap-2 px-4 pt-3">
      {browserFailure !== null ? (
        <Alert className="rounded-xl border-destructive/30 bg-destructive/6">
          <AlertTriangle className="text-destructive" aria-hidden="true" />
          <AlertTitle className="text-destructive">查询浏览器未连接</AlertTitle>
          <AlertDescription className="text-foreground/80">
            <span>{browserFailure.split("。")[0]}。当前库存尚未更新，请按以下步骤处理：</span>
            <ol className="list-decimal space-y-1 pl-5">
              {describeBrowserRecovery(browserFailure).map((step) => <li key={step}>{step}</li>)}
            </ol>
            <span className="text-xs text-muted-foreground">
              仍无法恢复时，请把“查看详情”中的错误信息、果到雷达版本和浏览器版本通过项目的 GitHub Issues 反馈。
              {ui.running ? "运行中仍会按设置的间隔尝试连接。" : "当前监控已暂停。"}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              <Button variant="outline" size="sm" onClick={onRetryNow} disabled={isRetrying} aria-busy={isRetrying}>
                <RefreshCw className={isRetrying ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
                {isRetrying ? "正在连接…" : ui.running ? "处理后重试" : "开始监控"}
              </Button>
              <details className="min-w-0 text-xs text-muted-foreground">
                <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">查看详情</summary>
                <p className="mt-2 break-words select-text">{browserFailure}</p>
                <p className="mt-1 break-words">启动诊断（如已生成）位于查询浏览器专属目录的 browser-startup.log 中。</p>
              </details>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {ui.trouble !== null && browserFailure === null ? (
        <Alert className="rounded-xl border-unknown/35 bg-unknown/8">
          <AlertTriangle className="text-unknown-text" aria-hidden="true" />
          <AlertTitle className="text-unknown-text">监控结果暂不可信</AlertTitle>
          <AlertDescription className="text-foreground/80">
            <span>{ui.trouble.reason}</span>
            <span>列表状态可能不代表真实库存，请先排查后再继续等待。</span>
            {ui.trouble.advice !== null ? (
              <span className="font-medium text-foreground">{describeAdvice(ui.trouble.advice)}</span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {ui.update !== null ? (
        <Alert className="rounded-xl border-primary/25 bg-primary/6">
          <Download className="text-primary" aria-hidden="true" />
          <AlertTitle>{ui.updateInstalled ? "更新已安装" : "发现新版本"} {ui.update.version}</AlertTitle>
          <AlertDescription>
            <span>
              {ui.updateInstalled
                ? "请退出并重新打开应用，新版本才会生效。"
                : `当前版本 ${ui.update.currentVersion}，安装后需重启应用。`}
            </span>
            {ui.updateProgress !== null ? (
              <div className="w-full space-y-1" role="status" aria-live="polite">
                <span>{describeUpdateProgress(ui.updateProgress)}</span>
                {ui.updateProgress.phase === "downloading" ? (
                  <progress
                    className="block h-1.5 w-full max-w-sm accent-primary"
                    aria-label="更新下载进度"
                    max={100}
                    value={updatePercent(ui.updateProgress)}
                  />
                ) : null}
              </div>
            ) : null}
            {ui.updateError !== null ? <p className="break-words text-destructive" role="alert">{ui.updateError}</p> : null}
            <div className="mt-1 flex items-center gap-2">
              <Button size="sm" disabled={ui.installing || ui.updateInstalled} onClick={() => void installUpdate()}>
                {ui.updateInstalled ? "已安装" : ui.installing ? "正在更新…" : ui.updateError ? "重试" : "下载并安装"}
              </Button>
              {ui.updateError !== null ? (
                <Button size="sm" variant="outline" onClick={() => void openReleasePage()}>下载安装包</Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={ui.installing} onClick={dismissUpdate}>
                <X aria-hidden="true" /> 稍后
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
