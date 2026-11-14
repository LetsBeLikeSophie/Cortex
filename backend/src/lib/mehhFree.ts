import { createHash } from "node:crypto";
import { config } from "../config.js";
import { getClient } from "./db.js";
import { FREE_FIRST_COINS, FREE_MAX_COINS, FREE_SESSION_MS, FREE_SESSION_PHOTOS, freeRequestHash, integrityProblem, type MehhKind } from "./mehhRules.js";
import { monthWindow } from "./plans.js";
import { decodeIntegrityToken, isTokenRejected } from "./playIntegrity.js";
import { isPlayBillingConfigured } from "./googlePlay.js";
import type { FreeStart } from "../routes/mehh.js";

// Free AI coins for Mehh (docs/mehh-screenshot-ai.md "Free coins").
// Only the SHA-256 of Mehh's install id is stored; the Integrity verdict is
// checked and dropped.

export class MehhNotVerifiedError extends Error {}

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function integrityReady(): boolean {
  return isPlayBillingConfigured(); // same service account, its project linked to Mehh
}

export async function verifyFree(installId: string, nonce: string, integrityToken: string, now = Date.now()): Promise<void> {
  let payload;
  try {
    payload = await decodeIntegrityToken(config.mehhPackageName, integrityToken);
  } catch (err) {
    if (isTokenRejected(err)) throw new MehhNotVerifiedError("token rejected");
    throw err; // Google down: 503, Mehh tries later
  }
  const problem = integrityProblem(payload, {
    packageName: config.mehhPackageName,
    requestHash: freeRequestHash(installId, nonce, sha256Hex),
    now,
  });
  if (problem) throw new MehhNotVerifiedError(problem);
}

// Months turn at midnight KST, like the Pro monthly cap (plans.monthWindow).
const monthKey = (d: Date) => {
  const k = new Date(monthWindow(d).start.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function startFree(installId: string, kind: MehhKind, now = new Date()): Promise<FreeStart> {
  const { data, error } = await getClient().rpc("mehh_free_start", {
    p_install: sha256Hex(installId),
    p_month: monthKey(now),
    p_first: FREE_FIRST_COINS,
    p_max: FREE_MAX_COINS,
    p_kind: kind,
  });
  if (error) throw new Error(`mehh_free_start failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { session: string | null; coins: number };
  return { session: row.session, coins: row.coins, nextCoinAt: monthWindow(now).next.toISOString() };
}

export async function reserveFree(session: string, asked: number, now = new Date()) {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { data, error } = await getClient().rpc("mehh_free_reserve", {
    p_session: session,
    p_asked: asked,
    p_max: FREE_SESSION_PHOTOS,
    p_since: new Date(now.getTime() - FREE_SESSION_MS).toISOString(),
    p_day_start: dayStart.toISOString(),
    p_day_cap: config.mehhFreeDailyPhotos,
  });
  if (error) throw new Error(`mehh_free_reserve failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { granted: number; used: number };
  return { granted: row.granted, used: row.used, limit: FREE_SESSION_PHOTOS, resetsAt: new Date(now.getTime() + FREE_SESSION_MS).toISOString() };
}

export async function refundFree(session: string, photos: number): Promise<void> {
  const { error } = await getClient().rpc("mehh_free_refund", { p_session: session, p_photos: photos });
  if (error) throw new Error(`mehh_free_refund failed: ${error.message}`);
}
