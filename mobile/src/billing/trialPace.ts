// The trial-ended Pro screen's pace line (decision 11-04 B2): at the rate
// someone saved during the trial, on which day of the month the free AI
// sorting would run out -- or null when the free share is enough.
export function freeRunsOutDay(saved: number, trialDays: number, freeLimit: number): number | null {
  if (saved <= 0 || trialDays <= 0) return null;
  const perDay = saved / trialDays;
  if (perDay * 30 <= freeLimit) return null;
  return Math.min(30, Math.max(1, Math.ceil(freeLimit / perDay)));
}
