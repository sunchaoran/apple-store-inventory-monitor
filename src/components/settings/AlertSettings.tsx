import { useState } from "react";
import { BellRing } from "lucide-react";

import { BarkPushSettings } from "@/components/settings/BarkPushSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveSettings, testNotify } from "@/lib/store";
import type { OpenOnHit, Settings } from "@/lib/types";

/** 「提醒」页：到货时电脑上做什么、推送到哪里，以及一键测试。 */
export function AlertSettings({ settings }: { settings: Settings }) {
  const [barkDraft, setBarkDraft] = useState<string | null>(null);
  const barkValue = barkDraft ?? settings.barkUrl;

  return (
    <div className="grid gap-4">
      <section className="settings-section" aria-labelledby="alert-local-title">
        <h3 id="alert-local-title" className="section-heading">到货时</h3>
        <div className="setting-row">
          <Label htmlFor="sound" className="text-sm font-normal">播放提示音</Label>
          <Switch
            id="sound"
            checked={settings.soundEnabled}
            onCheckedChange={(value) => void saveSettings({ soundEnabled: value })}
          />
        </div>
        <div className="setting-row">
          <Label htmlFor="open-on-hit" className="text-sm font-normal">到货后打开</Label>
          <Select value={settings.openOnHit} onValueChange={(value) => void saveSettings({ openOnHit: value as OpenOnHit })}>
            <SelectTrigger id="open-on-hit" className="control-surface h-8 w-44 max-w-full text-[13px]" aria-label="到货后打开">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="none">不自动打开</SelectItem>
              <SelectItem value="bag">购物袋</SelectItem>
              <SelectItem value="education_bag">跳转至教育商店购物袋</SelectItem>
              <SelectItem value="product">商品详情</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <div className="setting-row">
            <Label htmlFor="stop-on-hit" className="text-sm font-normal">到货后暂停监控</Label>
            <Switch
              id="stop-on-hit"
              checked={settings.stopOnHit}
              onCheckedChange={(value) => void saveSettings({ stopOnHit: value })}
            />
          </div>
          <p className="hint">
            {settings.stopOnHit
              ? "普通监控到货后暂停；开启自动结账时，失败会继续监控重试，完成结账或需要确认订单结果后才暂停。"
              : "持续有货时，每一轮查询都会重新提醒；开启了自动结账且上一次没有成功时，也会再次尝试。"}
          </p>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="alert-bark-title">
        <h3 id="alert-bark-title" className="section-heading">Bark 推送到 iPhone</h3>
        <div className="field-group">
          <Label htmlFor="bark" className="control-label">默认 Bark 推送</Label>
          <Input
            id="bark"
            className="control-surface select-text"
            placeholder="https://api.day.app/你的BarkKey"
            value={barkValue}
            onChange={(event) => setBarkDraft(event.target.value)}
            onBlur={() => {
              setBarkDraft(null);
              void saveSettings({ barkUrl: barkValue.trim() });
            }}
          />
          <p className="hint">留空则不推送。监控列表中每个型号标题行的「默认」按钮可为该型号单独指定其他人的 Bark 地址。</p>
        </div>
        <BarkPushSettings options={settings.barkOptions} />
      </section>

      <section className="settings-section">
        <Button variant="outline" className="w-full" onClick={() => void testNotify()}>
          <BellRing aria-hidden="true" /> 测试提醒与跳转
        </Button>
        <p className="hint -mt-1">按上面的设置执行一次提示音、Bark 推送和页面跳转，不代表有货。</p>
      </section>
    </div>
  );
}
