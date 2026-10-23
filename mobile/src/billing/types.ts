// Shared by the paywall and billing/AndroidPurchase -- kept apart so the
// paywall can import these without pulling in expo-iap (native-only; the
// web build must never load it).
export type PlanOption = 'monthly' | 'yearly' | 'lifetime';
export type StorePrices = Partial<Record<PlanOption, string>>;

// Play's own subscription page for this app -- where a subscription is
// cancelled (deleting the Cortex account does not cancel it).
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=dev.itssophie.cortex';

// A lifetime pass shows up as Pro "until" the server's far-future date
// (billing.ts FOREVER) -- nothing renews, so nothing to cancel.
export function isLifetimePro(proUntil: string | null | undefined): boolean {
  return !!proUntil && proUntil.startsWith('9999');
}
