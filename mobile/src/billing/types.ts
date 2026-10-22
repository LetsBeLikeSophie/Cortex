// Shared by the paywall and billing/AndroidPurchase -- kept apart so the
// paywall can import these without pulling in expo-iap (native-only; the
// web build must never load it).
export type PlanOption = 'monthly' | 'yearly' | 'lifetime';
export type StorePrices = Partial<Record<PlanOption, string>>;
