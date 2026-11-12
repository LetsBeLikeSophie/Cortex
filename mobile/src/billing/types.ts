// Shared by the paywall and billing/AndroidPurchase -- kept apart so the
// paywall can import these without pulling in expo-iap (native-only; the
// web build must never load it).
export type PlanOption = 'monthly' | 'yearly' | 'lifetime';
// yearlySave: how much cheaper yearly is here, from what Play charges in this
// country (prices are set per country, so a fixed % could be untrue).
export type StorePrices = Partial<Record<PlanOption, string>> & { yearlySave?: number };

// Play's own page for this app's subscription (sku opens it directly; the
// list page alone sometimes kept loading, 11-12 test) -- where it is
// cancelled (deleting the Cortex account does not cancel it).
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?sku=cortex_pro&package=dev.itssophie.cortex';

// A lifetime pass shows up as Pro "until" the server's far-future date
// (billing.ts FOREVER) -- nothing renews, so nothing to cancel.
export function isLifetimePro(proUntil: string | null | undefined): boolean {
  return !!proUntil && proUntil.startsWith('9999');
}
