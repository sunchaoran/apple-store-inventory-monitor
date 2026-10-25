import { useEffect, useMemo, useState } from "react";
import { MapPin, PackageCheck, Plus, RefreshCw, Smartphone, Store as StoreIcon } from "lucide-react";

import { Combobox } from "@/components/Combobox";
import { MultiCombobox } from "@/components/MultiCombobox";
import { compactProductName, watchBandDescription } from "@/components/monitor/productNames";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { changeLocale, refreshProducts, setCategory, setTargets } from "@/lib/store";
import { compareNewestProducts } from "@/lib/productOrder";
import { targetKey, type Category, type CategoryOption, type Product, type Region, type Store, type Target } from "@/lib/types";

/**
 * 新建监控。
 *
 * 添加是偶尔才做的事，放进对话框后监控列表能占满主区域。选择状态放在对话框
 * 外层组件里，关掉再打开仍保留已选门店，方便给同一批门店继续添加型号。
 */
export function AddMonitorDialog({
  open,
  onOpenChange,
  regions,
  categories,
  category,
  locale,
  stores,
  products,
  targets,
  refreshing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: Region[];
  categories: CategoryOption[];
  category: Category;
  locale: string;
  stores: Store[];
  products: Product[];
  targets: Target[];
  refreshing: boolean;
}) {
  const [storeNumbers, setStoreNumbers] = useState<string[]>([]);
  const [partNumbers, setPartNumbers] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const storeOptions = useMemo(
    () => stores.map((store) => ({ value: store.number, label: store.title })),
    [stores],
  );
  const productOptions = useMemo(
    () =>
      products
        .filter((product) => product.category === category)
        .sort(compareNewestProducts)
        .map((product) => ({
          value: product.partNumber,
          label: compactProductName(product.title),
          description: product.category === "watch"
            ? watchBandDescription(product.companionPart)
            : undefined,
        })),
    [products, category],
  );

  // 刷新目录或切换地区后，已经不存在的选项要从选择里去掉。
  useEffect(() => {
    const valid = new Set(storeOptions.map((option) => option.value));
    setStoreNumbers((previous) => {
      const next = previous.filter((value) => valid.has(value));
      return next.length === previous.length ? previous : next;
    });
  }, [storeOptions]);

  useEffect(() => {
    const valid = new Set(productOptions.map((option) => option.value));
    setPartNumbers((previous) => {
      const next = previous.filter((value) => valid.has(value));
      return next.length === previous.length ? previous : next;
    });
  }, [productOptions]);

  const pendingTargets = useMemo(() => {
    const existing = new Set(targets.map(targetKey));
    const storesByNumber = new Map(stores.map((store) => [store.number, store]));
    const productsByPart = new Map(products.map((product) => [product.partNumber, product]));
    const pending: Target[] = [];

    for (const storeNumber of storeNumbers) {
      const store = storesByNumber.get(storeNumber);
      if (!store) continue;
      for (const partNumber of partNumbers) {
        const product = productsByPart.get(partNumber);
        if (!product || product.category !== category) continue;
        // 同一表壳已经在别的门店选过精确表带时沿用它，保持「同一表壳在所有门店共用这条表带」；
        // 否则用目录默认表带。
        const chosenBand = targets.find((item) => (
          item.locale === locale && item.partNumber === product.partNumber && item.companionName && item.companionPart
        ));
        const target: Target = {
          locale,
          storeNumber: store.number,
          storeTitle: store.title,
          partNumber: product.partNumber,
          productName: product.title,
          ...(chosenBand
            ? { companionPart: chosenBand.companionPart, companionName: chosenBand.companionName }
            : product.companionPart ? { companionPart: product.companionPart } : {}),
          ...(product.kitPart ? { kitPart: product.kitPart } : {}),
        };
        if (!existing.has(targetKey(target))) {
          existing.add(targetKey(target));
          pending.push(target);
        }
      }
    }
    return pending;
  }, [partNumbers, storeNumbers, targets, category, products, locale, stores]);

  const hasCompleteSelection = storeNumbers.length > 0 && partNumbers.length > 0;
  const canAdd = pendingTargets.length > 0 && !isAdding;
  const duplicateCount = storeNumbers.length * partNumbers.length - pendingTargets.length;

  async function onAdd() {
    if (!canAdd) return;
    setIsAdding(true);
    try {
      if (await setTargets([...targets, ...pendingTargets])) {
        setPartNumbers([]);
        onOpenChange(false);
      }
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isAdding && onOpenChange(next)}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>添加监控</DialogTitle>
          <DialogDescription className="leading-5">
            门店和型号都可以多选，会按全部组合创建监控；已在列表中的组合会自动跳过。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="field-group">
              <Label className="control-label">
                <MapPin className="size-3.5" aria-hidden="true" /> 地区
              </Label>
              <Combobox
                modal
                className="control-surface w-full"
                options={regions.map((region) => ({ value: region.locale, label: region.title }))}
                value={locale}
                onChange={(next) => {
                  setStoreNumbers([]);
                  setPartNumbers([]);
                  void changeLocale(next);
                }}
                placeholder="选择地区"
                searchPlaceholder="搜索地区…"
                emptyText="没有匹配的地区"
                disabled={isAdding}
              />
            </div>
            <div className="field-group">
              <Label className="control-label">
                <Smartphone className="size-3.5" aria-hidden="true" /> 品类
              </Label>
              <Combobox
                modal
                className="control-surface w-full"
                options={categories.map((item) => ({ value: item.value, label: item.title }))}
                value={category}
                onChange={(value) => {
                  setPartNumbers([]);
                  setCategory(value as Category);
                }}
                placeholder="选择品类"
                searchPlaceholder="搜索品类…"
                emptyText="没有匹配的品类"
                disabled={isAdding || categories.length === 0}
              />
            </div>
          </div>

          <div className="field-group">
            <Label className="control-label">
              <StoreIcon className="size-3.5" aria-hidden="true" /> 门店
              <span className="font-normal">· 可多选</span>
            </Label>
            <MultiCombobox
              modal
              key={`stores-${locale}`}
              className="control-surface w-full"
              options={storeOptions}
              values={storeNumbers}
              onChange={setStoreNumbers}
              placeholder="选择自提门店"
              searchPlaceholder="搜索门店…"
              emptyText="没有匹配的门店"
              selectionUnit="家门店"
              disabled={isAdding || storeOptions.length === 0}
            />
          </div>

          <div className="field-group">
            <Label className="control-label">
              <PackageCheck className="size-3.5" aria-hidden="true" /> 型号
              <span className="font-normal">· 可多选</span>
            </Label>
            <MultiCombobox
              modal
              key={`products-${locale}-${category}`}
              className="control-surface w-full"
              options={productOptions}
              values={partNumbers}
              onChange={setPartNumbers}
              placeholder="选择型号"
              searchPlaceholder="搜索型号…"
              emptyText="没有匹配的型号"
              selectionUnit="个型号"
              disabled={isAdding || productOptions.length === 0}
            />
            <p className="hint">
              单次查询最多包含 20 个零件号，超过后会自动分批，不会遗漏已选型号。
              {category === "watch"
                ? "Watch 会先使用目录默认表带查询；添加后可在监控列表的型号标题下，按官网款式、颜色和尺码选择精确表带。"
                : ""}
            </p>
          </div>
        </div>

        <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground" role="status">
          {hasCompleteSelection
            ? <>将新增 <span className="font-semibold text-foreground tabular-nums">{pendingTargets.length}</span> 条监控{duplicateCount > 0 ? `，跳过 ${duplicateCount} 条已有组合` : ""}。</>
            : "找不到刚发布的型号或新开的门店时，先点左下角「更新目录」从 Apple 官网更新当前地区和品类。"}
        </p>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            disabled={refreshing || isAdding}
            onClick={() => void refreshProducts()}
            title="从 Apple 官网更新门店列表和当前品类的型号"
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
            {refreshing ? "正在更新目录…" : "更新目录"}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAdding}>
              取消
            </Button>
            <Button className="min-w-28" onClick={() => void onAdd()} disabled={!canAdd}>
              <Plus aria-hidden="true" />
              {isAdding
                ? "添加中…"
                : canAdd
                  ? `添加 ${pendingTargets.length} 项`
                  : hasCompleteSelection
                    ? "已在列表中"
                    : "添加监控"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
