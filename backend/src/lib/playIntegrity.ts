import { accessToken } from "./googlePlay.js";

// Play Integrity API, standard request: Mehh asks Google Play on the phone
// for a token bound to a request hash, the server has Google decode it.
// https://developer.android.com/google/play/integrity/standard
// The service account's Cloud project (cortex) is linked to Mehh in Play
// Console (2026-11-14), which is what lets it decode Mehh's tokens.

const SCOPE = "https://www.googleapis.com/auth/playintegrity";
const TIMEOUT_MS = 10_000;
const MAX_ANSWER_BYTES = 64 * 1024;

// Only the fields Mehh's free AI coins look at.
export interface IntegrityPayload {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string };
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}

export class IntegrityApiError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`Play Integrity ${status}: ${body.slice(0, 300)}`);
  }
}

// Google says the token itself is bad (garbled, another app's, expired):
// asking again can't help, so the request is refused rather than retried.
export function isTokenRejected(err: unknown): boolean {
  return err instanceof IntegrityApiError && err.status === 400;
}

export async function decodeIntegrityToken(packageName: string, token: string): Promise<IntegrityPayload> {
  const res = await fetch(`https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${await accessToken(SCOPE)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ integrity_token: token }),
  });
  const text = await res.text();
  if (!res.ok) throw new IntegrityApiError(res.status, text.slice(0, MAX_ANSWER_BYTES));
  if (text.length > MAX_ANSWER_BYTES) throw new Error("Play Integrity answer too large");
  const body = JSON.parse(text) as { tokenPayloadExternal?: IntegrityPayload };
  return body.tokenPayloadExternal ?? {};
}
