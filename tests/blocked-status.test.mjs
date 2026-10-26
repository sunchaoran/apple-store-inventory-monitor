import test from "node:test";
import assert from "node:assert/strict";
import { describeBlocked } from "../src/lib/blockedStatus.ts";

const now = new Date(2026, 9, 26, 0, 30, 0).getTime();
const blocked = {
  route: "系统代理 127.0.0.1:6152",
  sinceMs: new Date(2026, 9, 25, 23, 43, 20).getTime(),
  rejections: 9,
};
const running = { running: true, cooling: false, nextCheckAtMs: null };

test("说明走的哪个出口、从几点起被拦了多久、被拒了几次", () => {
  const today = { ...blocked, sinceMs: new Date(2026, 9, 26, 0, 12, 40).getTime() };
  assert.deepEqual(describeBlocked(today, running, now), {
    route: "线路：系统代理 127.0.0.1:6152",
    streak: "自 00:12 起已被拦截 17 分钟，连续 9 次请求被拒",
    plan: null,
  });
});

test("跨天时带上日期，超过一小时按小时和分钟说", () => {
  const summary = describeBlocked(blocked, running, now + 3_600_000);
  assert.equal(summary.streak, "自 10 月 25 日 23:43 起已被拦截 1 小时 46 分钟，连续 9 次请求被拒");
});

test("刚开始被拒时不显示零分钟", () => {
  const fresh = { ...blocked, sinceMs: now - 20_000, rejections: 1 };
  assert.match(describeBlocked(fresh, running, now).streak, /已被拦截不到 1 分钟，连续 1 次请求被拒/);
});

test("放慢探测时说明大约多久后再试，以及成功后恢复原间隔", () => {
  const cooling = { running: true, cooling: true, nextCheckAtMs: now + 61_000 };
  assert.equal(
    describeBlocked(blocked, cooling, now).plan,
    "已自动放慢探测，约 2 分钟后再试；拿到一次正常响应就恢复原来的查询间隔。",
  );
  const almost = { ...cooling, nextCheckAtMs: now + 5_000 };
  assert.match(describeBlocked(blocked, almost, now).plan, /约 1 分钟后再试/);
  const querying = { ...cooling, nextCheckAtMs: null };
  assert.equal(describeBlocked(blocked, querying, now).plan, null, "正在查询时没有下一次时间");
});

test("暂停后不再走时，也不说接下来的探测", () => {
  const paused = { running: false, cooling: true, nextCheckAtMs: now + 60_000 };
  assert.deepEqual(describeBlocked(blocked, paused, now), {
    route: "线路：系统代理 127.0.0.1:6152",
    streak: "自 10 月 25 日 23:43 起连续 9 次请求被拒，监控已暂停",
    plan: null,
  });
});
