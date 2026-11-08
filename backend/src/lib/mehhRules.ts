// Pure rules for Mehh's screenshot AI (docs/mehh-screenshot-ai.md): who
// counts as Mehh Pro, how many photos of a batch this month's cap lets
// through, and how the AI's answer maps back onto the photos sent. No I/O
// here, so all of it is tested without Google, Claude or the database.

// What Mehh does with a photo. Mehh shows its own words for each; the server
// never sends sentences.
export const MEHH_VERDICTS = ["useless", "receipt", "expired_coupon", "keep", "unsure"] as const;
export type MehhVerdict = (typeof MEHH_VERDICTS)[number];

// Why, as a short label Mehh translates. "other" when nothing fits.
export const MEHH_REASONS = [
  "used_code", // a one-time code, login or verification number already used
  "delivery_done", // shipping / delivery status, order tracking
  "temporary_info", // a timetable, weather, a route, a status screen
  "duplicate_info", // the same thing is in an app anyway (a bank balance, a chat)
  "receipt", // a payment receipt or order confirmation
  "coupon_expired", // a coupon, gift card or ticket whose date is past
  "coupon_valid", // a coupon, gift card or ticket still in date
  "ticket_upcoming", // a boarding pass, booking or ticket for a coming date
  "document", // an ID-like page, a contract, a certificate, account details
  "note", // a recipe, a how-to, a list, something to remember
  "person", // a person is visible -- left alone, never described
  "other",
] as const;
export type MehhReason = (typeof MEHH_REASONS)[number];

export interface MehhResult {
  id: string;
  verdict: MehhVerdict;
  reason: MehhReason;
}

// Google Play products.get answer for the lifetime pass, just the fields
// this needs (see googlePlay.ts PlayProductPurchase).
export interface MehhPurchase {
  purchaseState: number; // 0 purchased, 1 canceled (refunded), 2 pending
}

// Lifetime product: no expiry. A refund turns purchaseState to 1 and the pass
// stops counting from the next check; a pending payment doesn't count yet.
export function isMehhPro(p: MehhPurchase): boolean {
  return p.purchaseState === 0;
}

// How many photos of this batch go to the AI: all of them while the month
// has room, the first `left` of them when it has less. Never negative.
export function photosGranted(asked: number, used: number, limit: number): number {
  return Math.max(0, Math.min(asked, limit - used));
}

// The AI answers by position in the batch. Anything it skipped, repeated or
// made up becomes "unsure" (Mehh then leaves the photo as it was), so a bad
// answer can never mark a photo for deletion.
export function resultsFor(
  ids: string[],
  answer: { index: number; verdict: string; reason: string }[]
): MehhResult[] {
  const byIndex = new Map<number, { verdict: string; reason: string }>();
  for (const a of answer) if (Number.isInteger(a.index) && !byIndex.has(a.index)) byIndex.set(a.index, a);
  return ids.map((id, i) => {
    const a = byIndex.get(i);
    const verdict = (MEHH_VERDICTS as readonly string[]).includes(a?.verdict ?? "") ? (a!.verdict as MehhVerdict) : "unsure";
    const reason = (MEHH_REASONS as readonly string[]).includes(a?.reason ?? "") ? (a!.reason as MehhReason) : "other";
    // A person in the picture is never something to throw away by AI.
    if (reason === "person") return { id, verdict: "keep", reason };
    if (verdict === "unsure") return { id, verdict, reason: "other" };
    return { id, verdict, reason };
  });
}
