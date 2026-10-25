import test from "node:test";
import assert from "node:assert/strict";
import { describeRun } from "../src/lib/runStatus.ts";

const now = 1_000_000;
const base = {
  running: true,
  cooling: false,
  nextCheckAtMs: null,
  countdownTotalMs: null,
  intervalSeconds: 30,
  rows: [{ availability: { kind: "out_of_stock" } }],
};

test("暂停时只显示已暂停，不画进度", () => {
  assert.deepEqual(describeRun({ ...base, running: false }, now), {
    tone: "paused", label: "已暂停", countdown: null, progress: null,
  });
});

test("还没有下一轮时间时表示正在查询，进度不定", () => {
  assert.deepEqual(describeRun(base, now), {
    tone: "running", label: "正在查询", countdown: "间隔 30 秒", progress: null,
  });
  assert.equal(describeRun({ ...base, nextCheckAtMs: now - 500, countdownTotalMs: 30_000 }, now).label, "正在查询");
});

test("等待下一轮时按总时长算出已走过的比例，剩余秒数向上取整", () => {
  const status = describeRun({ ...base, nextCheckAtMs: now + 9_200, countdownTotalMs: 40_000 }, now);
  assert.equal(status.label, "监控中");
  assert.equal(status.countdown, "10 秒后检查");
  assert.ok(Math.abs(status.progress - 0.77) < 1e-9);
});

test("保护冷却用单独的状态和配色，倒计时照常推进", () => {
  const status = describeRun({ ...base, cooling: true, nextCheckAtMs: now + 60_000, countdownTotalMs: 240_000 }, now);
  assert.equal(status.tone, "cooling");
  assert.equal(status.label, "保护冷却中");
  assert.equal(status.countdown, "60 秒后检查");
  assert.equal(status.progress, 0.75);
});

test("浏览器未连接时说明多久后重试；正在重连时进度不定", () => {
  const rows = [{ availability: { kind: "unknown", reason: "browser_unavailable", detail: "退出码 21" } }];
  const waiting = describeRun({ ...base, rows, nextCheckAtMs: now + 5_000, countdownTotalMs: 20_000 }, now);
  assert.deepEqual(waiting, { tone: "failed", label: "浏览器未连接", countdown: "5 秒后重试", progress: 0.75 });
  const reconnecting = describeRun({ ...base, rows }, now);
  assert.deepEqual(reconnecting, { tone: "failed", label: "浏览器未连接", countdown: "正在重新连接", progress: null });
});

test("缺少总时长时按查询间隔估算，进度保持在 0 到 1 之间", () => {
  const status = describeRun({ ...base, nextCheckAtMs: now + 15_000 }, now);
  assert.equal(status.progress, 0.5);
  const overdue = describeRun({ ...base, nextCheckAtMs: now + 50_000, countdownTotalMs: 20_000 }, now);
  assert.equal(overdue.progress, 0);
});
