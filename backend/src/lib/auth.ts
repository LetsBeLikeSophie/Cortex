import { createClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import { config, required } from "../config.js";
import { DEV_USER_ID } from "./devUser.js";

// Verifies a Supabase access token (the JWT issued after social login) and
// returns the real user id it belongs to, or null if missing/invalid.
// Uses the service-role client only as a way to reach the Auth server --
// auth.getUser(token) validates the token itself, it doesn't need
// service-role privileges to do that.
export async function verifyAccessToken(token: string): Promise<string | null> {
  if (!config.hasSupabase) return null;
  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
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
