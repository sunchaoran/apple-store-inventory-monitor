import { useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setProductBarkUrl } from "@/lib/store";
import { targetKey, type Target } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 型号专属 Bark：同一型号在所有门店共用，所以挂在型号标题行上。 */
export function ProductBarkRoute({ target, customUrl }: { target: Target; customUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const hasCustomUrl = Boolean(customUrl);
  const inputId = `product-bark-${targetKey(target)}`;

  async function save() {
    setSaving(true);
    try {
      if (await setProductBarkUrl(target, draft)) setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(customUrl ?? "");
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn("shrink-0 gap-1 px-1.5 font-normal", hasCustomUrl ? "text-primary" : "text-muted-foreground")}
          aria-label={`${target.productName}：${hasCustomUrl ? "已设置专属 Bark" : "使用默认 Bark"}`}
          title={hasCustomUrl ? "此型号推送到专属 Bark 地址" : "此型号使用默认 Bark；点击可单独指定"}
        >
          <BellRing aria-hidden="true" />
          {hasCustomUrl ? "专属" : "默认"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] space-y-4 rounded-xl">
        <PopoverHeader>
          <PopoverTitle>此型号的 Bark 推送</PopoverTitle>
          <PopoverDescription className="leading-5 break-words">
            {target.productName}。同一型号在不同门店共用此地址；留空则沿用「提醒」设置里的默认 Bark。
          </PopoverDescription>
        </PopoverHeader>
        <div className="field-group">
          <Label htmlFor={inputId} className="control-label">
            专属 Bark 地址
          </Label>
          <Input
            id={inputId}
            type="url"
            className="control-surface select-text"
            placeholder="https://api.day.app/对方的BarkKey"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            disabled={saving}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "保存中…" : draft.trim() ? "保存专属地址" : "使用默认地址"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
