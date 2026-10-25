import test from "node:test";
import assert from "node:assert/strict";
import { countByFilter, filterGroups, groupMonitorsByProduct, matchesFilter } from "../src/lib/monitorGroups.ts";

const target = (storeNumber, storeTitle, partNumber, productName, locale = "zh_CN") => ({
  locale, storeNumber, storeTitle, partNumber, productName,
});

const row = (t, availability, extra = {}) => ({
  target: t, availability, lastCheckedMs: 1_000, consecutiveFailures: 0, ...extra,
});

const details = (saleMessage) => ({ pickupDisplay: "unavailable", pickupQuote: null, saleReason: null, saleMessage });

test("同一型号的多家门店归为一组，新款在前，组内按门店稳定排序", () => {
  const groups = groupMonitorsByProduct([
    row(target("R581", "五角场", "MYEV3CH/A", "iPhone 16 128GB 黑色"), { kind: "out_of_stock" }),
    row(target("R683", "环球港", "MG6X4CH/A", "iPhone 17 256GB 白色"), { kind: "in_stock" }),
    row(target("R390", "香港广场", "MG6X4CH/A", "iPhone 17 256GB 白色"), { kind: "out_of_stock" }),
  ]);

  assert.deepEqual(groups.map((group) => group.target.partNumber), ["MG6X4CH/A", "MYEV3CH/A"]);
  assert.deepEqual(groups[0].rows.map((item) => item.target.storeTitle), ["环球港", "香港广场"]);
  assert.equal(groups[0].key, "zh_CN|MG6X4CH/A");
});

test("不同地区的同一零件号分开成组，与 Watch 表带和专属 Bark 的作用范围一致", () => {
  const groups = groupMonitorsByProduct([
    row(target("R359", "南京东路", "MG6X4CH/A", "iPhone 17 256GB 白色"), { kind: "out_of_stock" }),
    row(target("R409", "Causeway Bay", "MG6X4CH/A", "iPhone 17 256GB 白色", "zh_HK"), { kind: "out_of_stock" }),
  ]);

  assert.deepEqual(groups.map((group) => group.key).sort(), ["zh_CN|MG6X4CH/A", "zh_HK|MG6X4CH/A"]);
});

const product = "iPhone 17 256GB 白色";
const mixedDeliveryRows = [
  row(target("R359", "南京东路", "MG6X4CH/A", product), { kind: "out_of_stock" }, { pickupDetails: details("送货日期：2026/10/27"), lastCheckedMs: 2_000 }),
  row(target("R390", "香港广场", "MG6X4CH/A", product), { kind: "out_of_stock" }, { pickupDetails: details("送货日期：2026/10/28"), lastCheckedMs: 5_000 }),
  row(target("R401", "上海环贸 iapm", "MG6X4CH/A", product), { kind: "unknown", reason: "blocked", detail: "HTTP 541" }, { lastCheckedMs: 9_000 }),
];

test("设置了统一送货地址时，型号组取最近一次带回的送货说明，没有说明的门店不覆盖它", () => {
  const [group] = groupMonitorsByProduct(mixedDeliveryRows, { sharedDeliveryLocales: new Set(["zh_CN"]) });

  assert.equal(group.deliveryPerStore, false);
  assert.equal(group.delivery?.pickupDetails.saleMessage, "送货日期：2026/10/28");
  assert.equal(group.delivery?.checkedMs, 5_000);
});

test("没有统一送货地址时，各门店说明不一致或有门店缺结果，就逐店显示而不合并", () => {
  const [group] = groupMonitorsByProduct(mixedDeliveryRows);
  assert.equal(group.deliveryPerStore, true);
  assert.equal(group.delivery, null);

  // 别的地区即使设置了中国大陆的送货地址，也仍按门店估算。
  const [hongKong] = groupMonitorsByProduct(
    mixedDeliveryRows.map((item) => ({ ...item, target: { ...item.target, locale: "zh_HK" } })),
    { sharedDeliveryLocales: new Set(["zh_CN"]) },
  );
  assert.equal(hongKong.deliveryPerStore, true);
});

test("没有统一送货地址但每家门店的送货说明完全一致时，仍合并到型号这一级", () => {
  const [group] = groupMonitorsByProduct([
    row(target("R359", "南京东路", "MG6X4CH/A", product), { kind: "out_of_stock" }, { pickupDetails: details("送货日期：2026/10/27"), lastCheckedMs: 2_000 }),
    row(target("R390", "香港广场", "MG6X4CH/A", product), { kind: "in_stock" }, { pickupDetails: details("送货日期：2026/10/27"), lastCheckedMs: 3_000 }),
  ]);

  assert.equal(group.deliveryPerStore, false);
  assert.equal(group.delivery?.checkedMs, 3_000);
});

test("没有任何送货说明时，型号组既不带送货信息也不逐店显示", () => {
  const [group] = groupMonitorsByProduct([
    row(target("R359", "南京东路", "MG6X4CH/A", product), { kind: "unknown", reason: "not_yet_checked" }, { lastCheckedMs: null }),
  ]);

  assert.equal(group.delivery, null);
  assert.equal(group.deliveryPerStore, false);
});

test("同一表壳在不同门店用了不同送货表带时标出来，避免被型号标题行掩盖", () => {
  const watch = "Apple Watch Series 11 46 毫米 亮黑色铝金属表壳";
  const [mixed] = groupMonitorsByProduct([
    row({ ...target("R359", "南京东路", "MEQ94CH/A", watch), companionPart: "MXLJ3FE/A", kitPart: "KIT" }, { kind: "out_of_stock" }),
    row({ ...target("R390", "香港广场", "MEQ94CH/A", watch), companionPart: "MXM23FE/A", companionName: "运动型表带 · 黑色 · M/L", kitPart: "KIT" }, { kind: "out_of_stock" }),
  ]);
  assert.equal(mixed.mixedCompanions, true);

  const [same] = groupMonitorsByProduct([
    row({ ...target("R359", "南京东路", "MEQ94CH/A", watch), companionPart: "MXLJ3FE/A", kitPart: "KIT" }, { kind: "out_of_stock" }),
    row({ ...target("R390", "香港广场", "MEQ94CH/A", watch), companionPart: "MXLJ3FE/A", kitPart: "KIT" }, { kind: "out_of_stock" }),
  ]);
  assert.equal(same.mixedCompanions, false);
});

test("筛选口径与概览一致：不可取货只算无货类，未确认不含待查询和待开放取货", () => {
  const rows = [
    { availability: { kind: "in_stock" } },
    { availability: { kind: "out_of_stock" } },
    { availability: { kind: "unknown", reason: "blocked", detail: "HTTP 541" } },
    { availability: { kind: "unknown", reason: "not_yet_checked" } },
    { availability: { kind: "unknown", reason: "pickup_pending" } },
  ];

  assert.deepEqual(countByFilter(rows), { all: 5, inStock: 1, unavailable: 1, untrusted: 1 });
  assert.equal(matchesFilter({ kind: "unknown", reason: "store_pickup_unavailable", store_number: "R359" }, "untrusted"), false);
});

test("按状态筛选时只保留有匹配门店的型号组，组内也只剩匹配的门店", () => {
  const groups = groupMonitorsByProduct([
    row(target("R359", "南京东路", "MG6X4CH/A", "iPhone 17 256GB 白色"), { kind: "in_stock" }),
    row(target("R390", "香港广场", "MG6X4CH/A", "iPhone 17 256GB 白色"), { kind: "out_of_stock" }),
    row(target("R581", "五角场", "MYEV3CH/A", "iPhone 16 128GB 黑色"), { kind: "out_of_stock" }),
  ]);

  const inStock = filterGroups(groups, "inStock");
  assert.equal(inStock.length, 1);
  assert.deepEqual(inStock[0].rows.map((item) => item.target.storeNumber), ["R359"]);
  assert.equal(filterGroups(groups, "all").length, 2);
  assert.equal(groups[0].rows.length, 2, "筛选不改动原分组");
});
