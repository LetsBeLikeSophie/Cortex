import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "../config.js";

// Google Play Developer API (androidpublisher v3), just the calls billing
// needs: read a subscription / one-time purchase by its token, and
// acknowledge it (Play refunds anything not acknowledged within 3 days).
// Auth is a service-account JWT signed with node:crypto -- no SDK.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let account: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  if (!config.playServiceAccountPath) return (account = null);
  account = JSON.parse(readFileSync(config.playServiceAccountPath, "utf8")) as ServiceAccount;
  return account;
}

export function isPlayBillingConfigured(): boolean {
  return !!config.playServiceAccountPath;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const sa = serviceAccount();
  if (!sa) throw new Error("Google Play service account not configured");
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

const BASE = () => `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${config.playPackageName}/purchases`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new PlayApiError(res.status, await res.text());
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export class PlayApiError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`Play API ${status}: ${body.slice(0, 300)}`);
  }
}

// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
export interface PlaySubscription {
  subscriptionState:
    | "SUBSCRIPTION_STATE_ACTIVE"
    | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
    | "SUBSCRIPTION_STATE_ON_HOLD"
    | "SUBSCRIPTION_STATE_PAUSED"
    | "SUBSCRIPTION_STATE_CANCELED"
    | "SUBSCRIPTION_STATE_EXPIRED"
    | "SUBSCRIPTION_STATE_PENDING"
    | "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"
    | string;
  acknowledgementState?: "ACKNOWLEDGEMENT_STATE_PENDING" | "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  // Set on a resubscribe or plan change: the token this one replaces.
  linkedPurchaseToken?: string;
  lineItems?: { productId: string; expiryTime?: string; offerDetails?: { basePlanId?: string } }[];
}

export function getSubscription(token: string): Promise<PlaySubscription> {
  return call<PlaySubscription>(`/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
}

export function acknowledgeSubscription(subscriptionId: string, token: string): Promise<unknown> {
  return call(`/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(token)}:acknowledge`, {
    method: "POST",
    body: "{}",
  });
}

// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products
export interface PlayProductPurchase {
  purchaseState: number; // 0 purchased, 1 canceled, 2 pending
  acknowledgementState: number; // 0 not yet, 1 acknowledged
  orderId?: string;
}

export function getProductPurchase(productId: string, token: string): Promise<PlayProductPurchase> {
  return call<PlayProductPurchase>(`/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`);
}

export function acknowledgeProduct(productId: string, token: string): Promise<unknown> {
  return call(`/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, {
    method: "POST",
    body: "{}",
  });
}
