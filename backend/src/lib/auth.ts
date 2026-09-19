import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { DEV_USER_ID } from "./devUser.js";
import { getClient } from "./supabase.js";

// auth.getUser(token) is a real network round trip to Supabase's Auth
// server (~300ms observed), and every single authenticated request was
// paying it on top of whatever the actual data query cost -- two sequential
// network hops per tap instead of one. Caching the verified result for a
// short window cuts that in half for the common case (someone actively
// browsing makes several requests within seconds of each other) while
// still re-checking often enough that a revoked session isn't trusted for
// long. Keyed by the raw token, not the user id, so a stolen/expired token
// can't outlive its own verification window regardless of user activity.
const VERIFIED_TOKEN_TTL_MS = 60_000;
const verifiedTokens = new Map<string, { userId: string; expiresAt: number }>();

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

  verifiedTokens.set(token, { userId: data.user.id, expiresAt: Date.now() + VERIFIED_TOKEN_TTL_MS });
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
