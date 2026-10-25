import { useEffect, useRef, useState } from "react";

import { NetworkSettings } from "@/components/settings/NetworkSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UiState } from "@/lib/store";
import { loadDeliveryLocalities, saveSettings, setIntervalSeconds } from "@/lib/store";
import type { DeliveryLocalities, DeliveryRegion } from "@/lib/types";

const EMPTY_DELIVERY_LOCALITIES: DeliveryLocalities = {
  states: [],
  cities: [],
  districts: [],
};

const EMPTY_REGION: DeliveryRegion = { state: "", city: "", district: "" };

function IntervalField({ intervalSeconds }: { intervalSeconds: number }) {
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? intervalSeconds;
  return (
    <div className="field-group">
      <Label htmlFor="interval" className="control-label">查询间隔</Label>
      <div className="relative w-36">
        <Input
          id="interval"
          type="number"
          min={1}
          className="control-surface pr-10 select-text tabular-nums"
          value={Number.isNaN(value) ? "" : value}
          onChange={(event) => setDraft(event.target.valueAsNumber)}
          onBlur={() => {
            const seconds = Number.isFinite(value) ? Math.round(value) : 30;
            setDraft(null);
            void setIntervalSeconds(seconds);
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">秒</span>
      </div>
      <p className="hint">每一轮查询完成后，等这么久再开始下一轮。间隔越短越容易触发 Apple 风控（HTTP 541），日常建议 30 秒或更长。</p>
    </div>
  );
}

/** 中国大陆送货地区：三级联动，选完「区」后自动保存。 */
function DeliveryRegionField({ ready, saved, running }: { ready: boolean; saved: DeliveryRegion | null; running: boolean }) {
  const [draft, setDraft] = useState<DeliveryRegion>(EMPTY_REGION);
  const [options, setOptions] = useState<DeliveryLocalities>(EMPTY_DELIVERY_LOCALITIES);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  // 每次保存任何设置都会换一个新的设置对象；只在省市区真的变了时才重新向 Apple 读取选项，
  // 否则切一下提示音也会多发一次地区查询。
  const savedKey = saved ? `${saved.state}|${saved.city}|${saved.district}` : "";

  useEffect(() => {
    if (!ready || dirty) return;
    setDraft(saved ?? EMPTY_REGION);
  }, [ready, savedKey, dirty]);

  useEffect(() => {
    if (!ready) return;
    const id = ++requestId.current;
    setLoading(true);
    void loadDeliveryLocalities(saved?.state, saved?.city)
      .then((next) => {
        if (requestId.current !== id) return;
        setOptions(next);
        if (saved && (
          !next.states.some((option) => option.value === saved.state)
          || !next.cities.some((option) => option.value === saved.city)
          || !next.districts.some((option) => option.value === saved.district)
        )) {
          setDraft(EMPTY_REGION);
          setDirty(true);
          setError("此前保存的地址不是 Apple 官方选项，请重新选择。");
        } else {
          setError(null);
        }
      })
      .catch((reason) => {
        if (requestId.current !== id) return;
        setOptions(EMPTY_DELIVERY_LOCALITIES);
        setError(`加载 Apple 地区选项失败：${String(reason)}`);
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [ready, savedKey]);

  async function refreshOptions(stateName: string, cityName = "") {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadDeliveryLocalities(stateName, cityName);
      if (requestId.current === id) setOptions(next);
    } catch (reason) {
      if (requestId.current === id) setError(`加载 Apple 地区选项失败：${String(reason)}`);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }

  async function persist(region: DeliveryRegion | null) {
    setSaving(true);
    setError(null);
    const ok = await saveSettings({ deliveryRegion: region });
    if (ok) {
      if (region === null) setDraft(EMPTY_REGION);
      setDirty(false);
    } else {
      setError(region === null ? "清除送货地区失败，请稍后重试。" : "送货地区保存失败，请重新选择区或稍后重试。");
    }
    setSaving(false);
  }

  const selectionValid =
    options.states.some((option) => option.value === draft.state)
    && options.cities.some((option) => option.value === draft.city)
    && options.districts.some((option) => option.value === draft.district);
  const statusText = saving
    ? "保存中…"
    : loading
      ? "读取官网…"
      : dirty
        ? selectionValid ? "即将保存" : "继续选择"
        : saved ? "已生效" : "未设置";

  return (
    <div className="field-group">
      <div className="flex items-center justify-between gap-3">
        <Label className="control-label">中国大陆送货地区</Label>
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">{statusText}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select
          value={options.states.some((option) => option.value === draft.state) ? draft.state : ""}
          disabled={loading || options.states.length === 0}
          onValueChange={(value) => {
            setDirty(true);
            setError(null);
            setDraft({ state: value, city: "", district: "" });
            void refreshOptions(value);
          }}
        >
          <SelectTrigger aria-label="省份" className="control-surface w-full min-w-0 px-2.5 text-[13px]">
            <SelectValue placeholder="省份" />
          </SelectTrigger>
          <SelectContent>
            {options.states.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.text}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={options.cities.some((option) => option.value === draft.city) ? draft.city : ""}
          disabled={loading || !draft.state || options.cities.length === 0}
          onValueChange={(value) => {
            setDirty(true);
            setError(null);
            setDraft((previous) => ({ ...previous, city: value, district: "" }));
            void refreshOptions(draft.state, value);
          }}
        >
          <SelectTrigger aria-label="城市" className="control-surface w-full min-w-0 px-2.5 text-[13px]">
            <SelectValue placeholder="城市" />
          </SelectTrigger>
          <SelectContent>
            {options.cities.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.text}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={options.districts.some((option) => option.value === draft.district) ? draft.district : ""}
          disabled={loading || !draft.city || options.districts.length === 0}
          onValueChange={(value) => {
            const next = { ...draft, district: value };
            setDirty(true);
            setError(null);
            setDraft(next);
            void persist(next);
          }}
        >
          <SelectTrigger aria-label="区" className="control-surface w-full min-w-0 px-2.5 text-[13px]">
            <SelectValue placeholder="区" />
          </SelectTrigger>
          <SelectContent>
            {options.districts.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.text}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="hint">
          用于查询 Apple 预计送货日期，只对中国大陆的监控生效，与添加监控时选的地区无关；选完「区」后自动保存。
          {running ? "下轮会更新送货日期。" : "开始监控后会查询送货日期。"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          disabled={saving || (!saved && !dirty)}
          onClick={() => void persist(null)}
        >
          清除
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
    </div>
  );
}

/** 「查询」页：查询频率、送货地区和出口线路，都是影响向 Apple 发请求的设置。 */
export function QuerySettings({ ui }: { ui: UiState }) {
  return (
    <div className="grid gap-4">
      <section className="settings-section" aria-labelledby="query-basic-title">
        <h3 id="query-basic-title" className="section-heading">查询频率与送货</h3>
        <IntervalField intervalSeconds={ui.settings.intervalSeconds} />
        <DeliveryRegionField ready={ui.ready} saved={ui.settings.deliveryRegion} running={ui.running} />
      </section>
      <section className="settings-section" aria-labelledby="network-title">
        <NetworkSettings network={ui.settings.network} running={ui.running} route={ui.route} />
      </section>
    </div>
  );
}
