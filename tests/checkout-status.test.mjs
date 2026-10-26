import test from "node:test";
import assert from "node:assert/strict";
import { describeCheckoutSignIn, needsCheckoutSignIn } from "../src/lib/checkoutStatus.ts";

const now = new Date(2026, 9, 26, 1, 20, 0).getTime();

test("自动结账页写出最近一次确认登录的时间和结果", () => {
  assert.equal(describeCheckoutSignIn(null, now), null, "还没确认过时不写");
  assert.equal(
    describeCheckoutSignIn({ signedIn: true, checkedAtMs: new Date(2026, 9, 26, 1, 5, 30).getTime() }, now),
    "01:05 确认：Apple 账户已登录",
  );
  assert.equal(
    describeCheckoutSignIn({ signedIn: false, checkedAtMs: new Date(2026, 9, 25, 23, 50, 0).getTime() }, now),
    "10 月 25 日 23:50 确认：Apple 账户没有登录",
  );
});

test("只在开着自动结账并确认过没登录时提醒", () => {
  const signedOut = { signedIn: false, checkedAtMs: now };
  assert.equal(needsCheckoutSignIn(signedOut, true), true);
  assert.equal(needsCheckoutSignIn(signedOut, false), false, "关了自动结账就不再提醒");
  assert.equal(needsCheckoutSignIn({ signedIn: true, checkedAtMs: now }, true), false);
  assert.equal(needsCheckoutSignIn(null, true), false, "没确认过不下结论");
});
