import { formatMoment } from "./blockedStatus.ts";
import type { CheckoutSignIn } from "./types.ts";

/** 「自动结账」页上的一行：最近一次确认下单浏览器登录状态的时间和结果。 */
export function describeCheckoutSignIn(status: CheckoutSignIn | null, nowMs: number): string | null {
  if (status === null) return null;
  return `${formatMoment(status.checkedAtMs, nowMs)} 确认：${status.signedIn ? "Apple 账户已登录" : "Apple 账户没有登录"}`;
}

/** 是否要挂出「下单浏览器没有登录」的提醒：只在开着自动结账、并且确认过没登录时。 */
export function needsCheckoutSignIn(status: CheckoutSignIn | null, checkoutEnabled: boolean): boolean {
  return checkoutEnabled && status !== null && !status.signedIn;
}
