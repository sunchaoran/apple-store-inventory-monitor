import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SIGHTINGS,
  addSighting,
  clockTime,
  dayLabel,
  describeRowSighting,
  describeSpan,
  groupByDay,
  latestSightings,
  listSightings,
} from "../src/lib/sightings.ts";

const at = (hour, minute, second = 0, day = 26, month = 9) => new Date(2026, month, day, hour, minute, second).getTime();
const target = (store) => ({
  locale: "zh_CN",
  storeNumber: store,
  storeTitle: `门店${store}`,
  partNumber: "MG6W4CH/A",
  productName: "iPhone 17 256GB 黑色",
});
const record = (store, sighting) => ({ target: target(store), sighting });
const ended = (since) => ({ sinceMs: since, lastSeenMs: since + 60_000, endedMs: since + 90_000, rounds: 3 });

test("持续多久按分钟说，说不准的情况照实写", () => {
  const now = at(12, 10);
  assert.equal(describeSpan({ sinceMs: at(12, 9, 30), lastSeenMs: at(12, 9, 30), rounds: 1 }, now), "正在有货");
  assert.equal(describeSpan({ sinceMs: at(12, 0), lastSeenMs: at(12, 9), rounds: 18 }, now), "正在有货，已 10 分钟");
  assert.equal(describeSpan({ sinceMs: at(12, 0), lastSeenMs: at(12, 3, 10), endedMs: at(12, 3, 40), rounds: 7 }, now), "持续约 3 分钟");
  assert.equal(describeSpan({ sinceMs: at(12, 0), lastSeenMs: at(12, 0, 30), endedMs: at(12, 1), rounds: 2 }, now), "持续不到 1 分钟");
  assert.equal(describeSpan({ sinceMs: at(12, 0), lastSeenMs: at(12, 0), endedMs: at(12, 0, 30), rounds: 1 }, now), "只查到一次");
  assert.equal(
    describeSpan({ sinceMs: at(9, 0), lastSeenMs: at(10, 5), endedMs: at(10, 6), interrupted: true, rounds: 120 }, now),
    "停止查询时仍有货",
  );
  assert.equal(describeSpan({ sinceMs: at(9, 0), lastSeenMs: at(10, 5), endedMs: at(10, 6), rounds: 120 }, now), "持续约 1 小时 5 分");
});

test("门店行写明几点起有货，或者上次有货是哪天几点", () => {
  const now = at(12, 10);
  assert.equal(describeRowSighting({ sinceMs: at(12, 0, 3), lastSeenMs: at(12, 9), rounds: 18 }, now), "12:00 起有货，已 9 分钟");
  assert.equal(describeRowSighting({ sinceMs: at(12, 9, 40), lastSeenMs: at(12, 9, 40), rounds: 1 }, now), "12:09 起有货");
  assert.equal(describeRowSighting(ended(at(9, 30)), now), "上次有货 今天 09:30 · 持续约 1 分钟");
  assert.equal(
    describeRowSighting({ sinceMs: at(23, 30, 0, 25), lastSeenMs: at(23, 30, 0, 25), endedMs: at(23, 31, 0, 25), rounds: 1 }, now),
    "上次有货 昨天 23:30 · 只查到一次",
  );
});

test("日期按今天、昨天、几月几日说，跨月也对", () => {
  assert.equal(dayLabel(at(0, 5), at(23, 59)), "今天");
  assert.equal(dayLabel(at(23, 50, 0, 31), at(0, 10, 0, 1, 10)), "昨天");
  assert.equal(dayLabel(at(8, 0, 0, 24), at(12, 0)), "10月24日");
  assert.equal(clockTime(at(12, 0, 3)), "12:00");
  assert.equal(clockTime(at(12, 0, 3), true), "12:00:03");
});

test("历史里同一段只留一条，按开始时间排好，只保留最近的", () => {
  let history = [];
  history = addSighting(history, record("R359", ended(at(12, 0))));
  history = addSighting(history, record("R359", ended(at(9, 0))));
  history = addSighting(history, record("R359", { ...ended(at(12, 0)), rounds: 9 }));
  assert.deepEqual(history.map((item) => [item.sighting.sinceMs, item.sighting.rounds]), [[at(9, 0), 3], [at(12, 0), 9]]);

  for (let index = 0; index < MAX_SIGHTINGS + 5; index += 1) history = addSighting(history, record(`R${index}`, ended(index)));
  assert.equal(history.length, MAX_SIGHTINGS);
});

test("到货记录合并历史和快照，新的在前，快照里的更新", () => {
  const history = [record("R359", ended(at(9, 0))), record("R390", ended(at(10, 0)))];
  const rows = [
    { target: target("R390"), sighting: { ...ended(at(10, 0)), rounds: 4 } },
    { target: target("R448"), sighting: { sinceMs: at(12, 0), lastSeenMs: at(12, 1), rounds: 2 } },
    { target: target("R581") },
  ];
  const list = listSightings(history, rows);
  assert.deepEqual(list.map((item) => item.target.storeNumber), ["R448", "R390", "R359"]);
  assert.equal(list[1].sighting.rounds, 4);

  const latest = latestSightings([...history, record("R448", ended(at(8, 0)))], rows);
  assert.equal(latest.get("zh_CN|R448|MG6W4CH/A").sinceMs, at(12, 0), "快照里正在有货的比历史新");
  assert.equal(latest.get("zh_CN|R359|MG6W4CH/A").sinceMs, at(9, 0), "重启后快照里没有，就用历史");
  assert.equal(latest.has("zh_CN|R581|MG6W4CH/A"), false);
});

test("按天分组，组内保持新的在前", () => {
  const now = at(12, 0);
  const list = [record("R1", ended(at(11, 0))), record("R2", ended(at(9, 0))), record("R3", ended(at(22, 0, 0, 25)))];
  assert.deepEqual(
    groupByDay(list, now).map((group) => [group.label, group.records.map((item) => item.target.storeNumber)]),
    [["今天", ["R1", "R2"]], ["昨天", ["R3"]]],
  );
});
