// Pure rules for Mehh's screenshot AI (docs/mehh-screenshot-ai.md): who
// counts as Mehh Pro, how many photos of a batch this month's cap lets
// through, and how the AI's answer maps back onto the photos sent. No I/O
// here, so all of it is tested without Google, Claude or the database.

// What Mehh does with a photo. Mehh shows its own words for each; the server
// never sends sentences.
// "memo" is for day sets only: a photo taken to note something (a sign, a menu).
export const MEHH_VERDICTS = ["useless", "receipt", "expired_coupon", "memo", "keep", "unsure"] as const;
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
  // Day sets (photos from one day, Sophie 11-14):
  "blurry", // shaky, out of focus, motion blur
  "accidental", // pocket shot, floor, finger over the lens, black frame
  "meaningless", // nothing to see: a blank wall, ceiling, sky, a random corner
  "memo_info", // taken to note something: a sign, menu, price tag, notice, timetable, whiteboard
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
  purchaseTimeMillis?: string;
}

// Which Mehh Pro product a token belongs to.
export type MehhProduct = "lifetime" | "trial";

// Lifetime product: no expiry. A refund turns purchaseState to 1 and the pass
// stops counting from the next check; a pending payment doesn't count yet.
// 3-month Pro (`trial`, promo codes only): the same, and only for `trialDays`
// from its purchase time -- Mehh counts the same days on the phone. Without a
// purchase time it doesn't count (nothing to count from).
export function isMehhPro(p: MehhPurchase, product: MehhProduct = "lifetime", now = Date.now(), trialDays = 90): boolean {
  if (p.purchaseState !== 0) return false;
  if (product === "lifetime") return true;
  const at = Number(p.purchaseTimeMillis);
  if (!Number.isFinite(at) || at <= 0) return false;
  return now < at + trialDays * 24 * 60 * 60 * 1000;
}

// ---- Free AI coins (Sophie 11-14): no purchase, so the phone proves it is
// the real Mehh from Google Play on a real device (Play Integrity, standard
// request). The request hash ties the token to this install and this ask.

export interface IntegrityFacts {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string };
  appIntegrity?: { appRecognitionVerdict?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}

// What the request hash is made of, so phone and server compute the same one.
export function freeRequestHash(installId: string, nonce: string, sha256Hex: (s: string) => string): string {
  return sha256Hex(`mehh-free-ai|${installId}|${nonce}`);
}

export const INTEGRITY_MAX_AGE_MS = 10 * 60 * 1000;

// Why this verdict can't spend a free coin, or null when it can. Every check
// must pass: Mehh's package, the exact request hash, fresh, installed from
// Play (licensed), the Play build, a real device.
export function integrityProblem(
  p: IntegrityFacts,
  want: { packageName: string; requestHash: string; now: number; maxAgeMs?: number }
): string | null {
  const d = p.requestDetails ?? {};
  if (d.requestPackageName !== want.packageName) return "package";
  if (d.requestHash !== want.requestHash) return "request_hash";
  const at = Number(d.timestampMillis);
  if (!Number.isFinite(at) || Math.abs(want.now - at) > (want.maxAgeMs ?? INTEGRITY_MAX_AGE_MS)) return "stale";
  if (p.accountDetails?.appLicensingVerdict !== "LICENSED") return "unlicensed";
  if (p.appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") return "app";
  if (!(p.deviceIntegrity?.deviceRecognitionVerdict ?? []).includes("MEETS_DEVICE_INTEGRITY")) return "device";
  return null;
}

// Coins: 3 for a new install, then one more each month up to 3 (unused ones
// keep, nothing past 3). Months are "YYYY-MM" in UTC. The database applies
// this same rule inside one locked step (mehh_free_start).
export const FREE_FIRST_COINS = 3;
export const FREE_MAX_COINS = 3;
export function coinsNow(coins: number, lastRefill: string, month: string): number {
  if (month <= lastRefill) return coins;
  const [y1, m1] = lastRefill.split("-").map(Number);
  const [y2, m2] = month.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  return Math.min(FREE_MAX_COINS, coins + Math.max(0, months));
}

// One coin opens one AI session: one day set, or one screenshot run, up to
// this many photos, for this long.
export const FREE_SESSION_PHOTOS = 100;
export const FREE_SESSION_MS = 60 * 60 * 1000;

// How many photos of this batch go to the AI: all of them while the month
// has room, the first `left` of them when it has less. Never negative.
export function photosGranted(asked: number, used: number, limit: number): number {
  return Math.max(0, Math.min(asked, limit - used));
}

// The AI answers by position in the batch. Anything it skipped, repeated or
// made up becomes "unsure" (Mehh then leaves the photo as it was), so a bad
// answer can never mark a photo for deletion.
export type MehhKind = "screenshots" | "day";

export function resultsFor(
  ids: string[],
  answer: { index: number; verdict: string; reason: string }[],
  kind: MehhKind = "screenshots"
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
    // "memo" is a day-set answer; a screenshot that notes something is a note to keep
    // (older Mehh builds don't know "memo").
    if (verdict === "memo" && kind === "screenshots") return { id, verdict: "keep", reason: "note" };
    return { id, verdict, reason };
  });
}
