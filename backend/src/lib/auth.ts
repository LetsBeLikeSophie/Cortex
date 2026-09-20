import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { DEV_USER_ID } from "./devUser.js";
import { getClient } from "./supabase.js";

// auth.getUser(token) is a real network round trip to Supabase's Auth
// server (~300ms observed), and every single authenticated request was
// paying it on top of whatever the actual data query cost -- two sequential
// network hops per tap instead of one. Caching the verified result cuts
// that out for the common case (someone actively browsing makes several
// requests within seconds/minutes of each other).
//
// The cache lifetime is capped at the token's own `exp` claim, not a flat
// duration -- a token already carries a hard, tamper-proof expiry (Supabase
// issues these with a 1hr lifetime, confirmed 2026-09-19), so deriving from
// it means this can never trust a token past the moment it was genuinely
// designed to stop working, no matter how generous MAX_CACHE_MS is. It's
// also separately capped at MAX_CACHE_MS so a revoked-but-not-yet-expired
// session (account deleted, Kakao unlink) doesn't stay trusted for the
// token's full remaining hour -- 5 minutes bounds that exposure while still
// turning a whole browsing session into a single Auth-server round trip.
const MAX_CACHE_MS = 5 * 60_000;
const verifiedTokens = new Map<string, { userId: string; expiresAt: number }>();

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Verifies a Supabase access token (the JWT issued after social login) and
// returns the real user id it belongs to, or null if missing/invalid.
export async function verifyAccessToken(token: string): Promise<string | null> {
  if (!config.hasSupabase) return null;

  const cached = verifiedTokens.get(token);
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.userId;
    verifiedTokens.delete(token);
  }

  const { data, error } = await getClient().auth.getUser(token);
  if (error || !data.user) return null;

  const expiry = tokenExpiryMs(token);
  const cacheUntil = Math.min(Date.now() + MAX_CACHE_MS, expiry ?? Date.now() + MAX_CACHE_MS);
  // A token whose own exp claim has already passed shouldn't have verified
  // as valid in the first place, but never cache into the past just in case.
  if (cacheUntil > Date.now()) {
    verifiedTokens.set(token, { userId: data.user.id, expiresAt: cacheUntil });
  }
  return data.user.id;
}

export class UnauthorizedError extends Error {}

// Transitional: the mobile app doesn't have a login screen yet, so most
// requests still arrive with no Authorization header at all -- those fall
// back to the shared dev user, same as today. Once login ships, this starts
// returning the real signed-in user's id automatically with no other
// request-shape changes needed. A header that *is* present but doesn't
// verify is treated as a real (failed) login attempt, not "no auth" --
// falling back to DEV_USER_ID there would quietly mix a rejected caller
// into the shared dev bucket instead of telling them their session is bad.
// Remove the DEV_USER_ID fallback entirely once login is mandatory client-side.
export async function resolveUserId(req: FastifyRequest): Promise<string> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return DEV_USER_ID;

  const userId = await verifyAccessToken(header.slice("Bearer ".length));
  if (!userId) throw new UnauthorizedError("invalid or expired access token");
  return userId;
}
