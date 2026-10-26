import { ActivityLog } from "@/components/ActivityLog";
import { AlertSettings } from "@/components/settings/AlertSettings";
import { CheckoutSettings } from "@/components/settings/CheckoutSettings";
import { QuerySettings } from "@/components/settings/QuerySettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UiState } from "@/lib/store";
import { cn } from "@/lib/utils";

export type SideTab = "log" | "alerts" | "query" | "checkout";

export const SIDE_TABS: readonly SideTab[] = ["log", "alerts", "query", "checkout"];

/**
 * 右侧面板：活动日志与三组设置分页显示。
 *
 * 以前设置面板和日志排成一长列，日志被挤到三屏之外。现在日志默认可见，
 * 设置按用途分页。所有分页保持挂载，切换分页时不会丢掉正在填写的内容，
 * 也不会因为重新挂载而再向 Apple 读取一次送货地区选项。
 */
export function SidePanel({
  ui,
  tab,
  onTabChange,
}: {
  ui: UiState;
  tab: SideTab;
  onTabChange: (tab: SideTab) => void;
}) {
  const checkout = ui.settings.checkout;
  const settingsPage = "scroll-quiet min-h-0 overflow-y-auto px-4 py-4 data-[state=inactive]:hidden";

  return (
    <aside className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="活动日志与设置">
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as SideTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b border-border p-2.5">
          <TabsList className="w-full">
            <TabsTrigger value="log">活动日志</TabsTrigger>
            <TabsTrigger value="alerts">提醒</TabsTrigger>
            <TabsTrigger value="query">查询</TabsTrigger>
            <TabsTrigger value="checkout">
              自动结账
              {checkout.enabled ? (
                <span
                  className={cn("size-1.5 rounded-full", checkout.placeOrder ? "bg-unknown" : "bg-primary")}
                  aria-label={checkout.placeOrder ? "已开启，会自动下单" : "已开启"}
                />
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent forceMount value="log" className="flex min-h-0 flex-col data-[state=inactive]:hidden">
          <ActivityLog logs={ui.logs} active={tab === "log"} />
          <p className="shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground tabular-nums">
            共 {ui.logs.length} 条，只保留最近 300 条
          </p>
        </TabsContent>
        <TabsContent forceMount value="alerts" className={settingsPage}>
          <AlertSettings settings={ui.settings} />
        </TabsContent>
        <TabsContent forceMount value="query" className={settingsPage}>
          <QuerySettings ui={ui} />
        </TabsContent>
        <TabsContent forceMount value="checkout" className={settingsPage}>
          <CheckoutSettings checkout={checkout} targets={ui.settings.targets} signIn={ui.checkoutSignIn} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
