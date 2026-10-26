import { useEffect, useState, useSyncExternalStore } from "react";

import { AppHeader } from "@/components/AppHeader";
import { MonitorList } from "@/components/monitor/MonitorList";
import { SIDE_TABS, SidePanel, type SideTab } from "@/components/SidePanel";
import { StatusAlerts } from "@/components/StatusAlerts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { connect, queryNow, retryWatchingNow, startWatching, watcherStore } from "@/lib/store";

const SIDE_TAB_KEY = "apw.sidePanel.tab";

/** 右侧分页只是本机界面偏好；存储不可用时退回活动日志。 */
function readSideTab(): SideTab {
  try {
    const value = localStorage.getItem(SIDE_TAB_KEY);
    return SIDE_TABS.find((tab) => tab === value) ?? "log";
  } catch {
    return "log";
  }
}

function writeSideTab(tab: SideTab): void {
  try {
    localStorage.setItem(SIDE_TAB_KEY, tab);
  } catch {
    // 私密窗口或存储被禁用时只影响记忆，不影响切换本身。
  }
}

export default function App() {
  const ui = useSyncExternalStore(watcherStore.subscribe, watcherStore.getSnapshot);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [isRetrying, setIsRetrying] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>(readSideTab);

  useEffect(() => {
    void connect();
  }, []);

  // 只有运行中才需要每秒刷新倒计时；暂停时界面完全静止。
  useEffect(() => {
    if (!ui.running) return;
    setClockMs(Date.now());
    const timer = window.setInterval(() => setClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ui.running]);

  function changeSideTab(tab: SideTab) {
    setSideTab(tab);
    writeSideTab(tab);
  }

  async function onRetryNow() {
    setIsRetrying(true);
    try {
      if (ui.running) await retryWatchingNow();
      else await startWatching();
    } finally {
      setIsRetrying(false);
    }
  }

  async function onQueryNow() {
    setIsQuerying(true);
    try {
      await queryNow();
    } finally {
      setIsQuerying(false);
    }
  }

  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <AppHeader
          ui={ui}
          clockMs={clockMs}
          isRetrying={isRetrying}
          onRetryNow={() => void onRetryNow()}
          isQuerying={isQuerying}
          onQueryNow={() => void onQueryNow()}
          onShowCheckout={() => changeSideTab("checkout")}
        />
        <StatusAlerts ui={ui} clockMs={clockMs} isRetrying={isRetrying} onRetryNow={() => void onRetryNow()} />
        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-4 p-4 min-[1000px]:grid-cols-[minmax(0,1fr)_22rem] min-[1240px]:grid-cols-[minmax(0,1fr)_25rem] max-[860px]:grid-cols-1 max-[860px]:grid-rows-[minmax(26rem,1fr)_minmax(26rem,1fr)] max-[860px]:overflow-y-auto">
          <MonitorList ui={ui} />
          <SidePanel ui={ui} tab={sideTab} onTabChange={changeSideTab} />
        </main>
      </div>
    </TooltipProvider>
  );
}
