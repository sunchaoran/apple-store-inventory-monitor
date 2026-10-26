import { useEffect, useRef, useState } from "react";

import { NetworkSettings } from "@/components/settings/NetworkSettings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { UiState } from "@/lib/store";
import { loadDeliveryLocalities, saveSettings, setIntervalSeconds } from "@/lib/store";
import type { DeliveryLocalities, DeliveryRegion } from "@/lib/types";

const EMPTY_DELIVERY_LOCALITIES: DeliveryLocalities = {
  states: [],
  cities: [],
  districts: [],
};

const EMPTY_REGION: DeliveryRegion = { state: "", city: "", district: "" };

function IntervalField({ intervalSeconds, alignedOnly }: { intervalSeconds: number; alignedOnly: boolean }) {
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
      <p className="hint">
        {alignedOnly
          ? "已开启「只做定点查询」，暂不按这个间隔查询；关掉后恢复。"
          : "每一轮查询完成后，等这么久再开始下一轮。间隔越短越容易触发 Apple 风控（HTTP 541），日常建议 30 秒或更长。"}
      </p>
    </div>
  );
}

/** 每小时可勾选的定点时刻：每 5 分钟一个。 */
const MARK_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

function markLabel(minute: number): string {
  if (minute === 0) return "整点";
  if (minute === 30) return "半点";
  return `${String(minute).padStart(2, "0")} 分`;
}

/** 定点查询：勾选的每个时刻一到就立即查一轮，不等查询间隔走完；也可以只在这些时刻查。 */
function AlignedChecksField({ minutes, alignedOnly }: { minutes: number[]; alignedOnly: boolean }) {
  function toggle(minute: number, checked: boolean) {
    const next = checked ? [...minutes, minute] : minutes.filter((value) => value !== minute);
    void saveSettings({ alignedChecks: [...new Set(next)].sort((a, b) => a - b) });
  }
  return (
    <fieldset className="field-group">
      <legend className="control-label">定点查询</legend>
      <div className="grid grid-cols-4 gap-x-3 gap-y-2">
        {MARK_MINUTES.map((minute) => (
          <label key={minute} className="flex cursor-pointer items-center gap-2 text-[13px] tabular-nums">
            <Checkbox
              checked={minutes.includes(minute)}
              onCheckedChange={(checked) => toggle(minute, checked === true)}
              aria-label={minute === 0 ? "每个整点" : minute === 30 ? "每个半点" : `每小时第 ${minute} 分`}
            />
            {markLabel(minute)}
          </label>
        ))}
      </div>
      <div className="setting-row">
        <Label htmlFor="aligned-only" className="text-sm font-normal">只做定点查询</Label>
        <Switch
          id="aligned-only"
          checked={alignedOnly}
          disabled={minutes.length === 0}
          onCheckedChange={(value) => void saveSettings({ alignedOnly: value })}
        />
      </div>
      <p className="hint">
        {minutes.length === 0
          ? "全部不勾即关闭定点查询，照常按查询间隔查询；「只做定点查询」要勾选至少一个时刻才生效。"
          : alignedOnly
            ? "只在勾选的时刻查询，不再按查询间隔，例如只勾「整点」就每小时查一次；开始监控时会先查一轮，之后新加的监控也等到下一个勾选的时刻再查。Apple 正在拒绝查询（保护冷却中）时，等冷却结束后的第一个勾选时刻再查。"
            : "勾选的时刻一到就立即查一轮，不等查询间隔走完，之后照常按间隔查询；例如勾「整点」和「15 分」，就会在 12:00、12:15、13:00、13:15 各查一次。全部不勾即关闭。Apple 正在拒绝查询（保护冷却中）时不为此多查。"}
      </p>
    </fieldset>
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
        <IntervalField
          intervalSeconds={ui.settings.intervalSeconds}
          alignedOnly={ui.settings.alignedOnly && ui.settings.alignedChecks.length > 0}
        />
        <AlignedChecksField minutes={ui.settings.alignedChecks} alignedOnly={ui.settings.alignedOnly} />
        <DeliveryRegionField ready={ui.ready} saved={ui.settings.deliveryRegion} running={ui.running} />
      </section>
      <section className="settings-section" aria-labelledby="network-title">
        <NetworkSettings network={ui.settings.network} running={ui.running} route={ui.route} />
      </section>
    </div>
  );
}
