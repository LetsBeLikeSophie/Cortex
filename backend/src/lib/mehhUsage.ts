import { createHash } from "node:crypto";
import { config } from "../config.js";
import { getMehhPurchase, isPlayBillingConfigured, isPurchaseGone } from "./googlePlay.js";
import { isMehhPro } from "./mehhRules.js";
import { monthWindow } from "./plans.js";
import { getClient } from "./db.js";

// Mehh has no accounts: the lifetime purchase is the identity. Only its
// SHA-256 is kept (the cap's key); the token itself is never stored.
export function purchaseKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class MehhNotProError extends Error {}

// Google is asked at most once an hour per purchase: every batch would
// otherwise wait on it. A refund shows within that hour.
const VERIFY_TTL_MS = 60 * 60 * 1000;
const MAX_CACHED = 5000;
const verified = new Map<string, number>(); // key -> valid until (ms)

export function mehhBillingReady(): boolean {
  return isPlayBillingConfigured();
}

export async function requireMehhPro(token: string, key: string, now = Date.now()): Promise<void> {
  const until = verified.get(key);
  if (until && until > now) return;
  let ok: boolean;
  try {
    ok = isMehhPro(await getMehhPurchase(token));
  } catch (err) {
    if (isPurchaseGone(err)) ok = false;
    else throw err; // Google down: 503, Mehh tries later
  }
  if (!ok) {
    verified.delete(key);
    throw new MehhNotProError();
  }
  if (verified.size >= MAX_CACHED) verified.delete(verified.keys().next().value!);
  verified.set(key, now + VERIFY_TTL_MS);
}

export interface MehhReservation {
  id: number | null; // null when nothing was granted
  granted: number;
  used: number; // this month, including this batch
  limit: number;
  resetsAt: string;
}

// Counts the photos before the AI call, in one database step (mehh_ai_reserve
// locks per purchase, so two batches at once can't both take the last room).
export async function reserveMehhPhotos(key: string, asked: number, now = new Date()): Promise<MehhReservation> {
  const { start, next } = monthWindow(now);
  const limit = config.mehhAiMonthly;
  const { data, error } = await getClient().rpc("mehh_ai_reserve", {
    p_hash: key,
    p_asked: asked,
    p_limit: limit,
    p_since: start.toISOString(),
  });
  if (error) throw new Error(`mehh_ai_reserve failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { id: number | null; granted: number; used: number };
  return { id: row.id, granted: row.granted, used: row.used, limit, resetsAt: next.toISOString() };
}

// The AI call failed: the photos weren't looked at, so they don't count.
export async function refundMehhPhotos(id: number): Promise<void> {
  const { error } = await getClient().from("mehh_ai_usage").delete().eq("id", id);
  if (error) throw new Error(`refund mehh photos failed: ${error.message}`);
}
