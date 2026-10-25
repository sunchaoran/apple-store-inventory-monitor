import test from "node:test";
import assert from "node:assert/strict";
import { describeSession, endSession, formatDuration, joinSession, recordCycle, startSession } from "../src/lib/monitorSession.ts";

const inStock = { availability: { kind: "in_stock" } };
const outOfStock = { availability: { kind: "out_of_stock" } };

test("开始监控后逐轮累计轮数、请求数和有货次数", () => {
  let session = startSession(1_000);
  session = recordCycle(session, { cycle: 1, requestCount: 3, snapshot: [outOfStock, outOfStock] });
  session = recordCycle(session, { cycle: 2, requestCount: 2, snapshot: [inStock, outOfStock] });
  session = recordCycle(session, { cycle: 3, requestCount: 0, snapshot: [inStock, inStock] });
  assert.deepEqual(session, { startedAtMs: 1_000, endedAtMs: null, cycles: 3, requests: 5, hits: 3 });
});

test("界面中途打开时轮数直接用引擎的编号，请求从打开后开始累计", () => {
  const session = recordCycle(null, { cycle: 128, requestCount: 4, snapshot: [outOfStock] });
  assert.equal(session.cycles, 128);
  assert.equal(session.requests, 4);
  assert.equal(session.startedAtMs, null);
  assert.deepEqual(joinSession(), { startedAtMs: null, endedAtMs: null, cycles: 0, requests: 0, hits: 0 });
});

test("暂停后记下结束时间，运行时长不再增长", () => {
  const ended = endSession({ ...startSession(0), cycles: 10, requests: 30, hits: 1 }, 90_000);
  assert.equal(ended.endedAtMs, 90_000);
  assert.equal(endSession(ended, 999_999).endedAtMs, 90_000, "重复暂停不改结束时间");
  assert.match(describeSession(ended, 5_000_000), /共运行 1 分 30 秒，已暂停）：查询 10 轮，向 Apple 发出 30 次请求，发现有货 1 次/);
});

test("运行中的说明带开始时间和已运行时长；中途打开的说明注明统计范围", () => {
  const start = new Date(2026, 9, 25, 14, 2, 0).getTime();
  const running = describeSession({ ...startSession(start), cycles: 2, requests: 5, hits: 0 }, start + 3_725_000);
  assert.equal(running, "本次监控（14:02 开始，已运行 1 小时 2 分）：查询 2 轮，向 Apple 发出 5 次请求，发现有货 0 次。再次开始监控会重新计数。");
  assert.match(describeSession(joinSession(), 0), /从界面打开后开始统计/);
});

test("时长按小时、分、秒取最大的两级显示", () => {
  assert.equal(formatDuration(45_400), "45 秒");
  assert.equal(formatDuration(125_000), "2 分 5 秒");
  assert.equal(formatDuration(7_260_000), "2 小时 1 分");
  assert.equal(formatDuration(-5), "0 秒");
});
