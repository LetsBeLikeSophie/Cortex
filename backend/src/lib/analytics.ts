// App error log and pseudonymous analytics events.
import { createHmac } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, required } from "../config.js";
import { recordOnlyRaw } from "./billingRules.js";
import { Category } from "./categories.js";
import type { SearchInterpretation } from "./anthropic.js";
import { scanPages } from "./scanPages.js";
import { SOURCE_CATALOG, CAPTURE_TYPE_CATALOG } from "./sourceCatalog.js";
import { newestOfBoth, tagArrayLiteral, tagsArrayLiteral } from "./tagQuery.js";
import { tagLockChange, type LockState } from "./tagLock.js";
import { getClient } from "./db.js";
import { ItemSource } from "./items.js";

export async function logAppError(row: { appVersion: string; name: string; stack: string }): Promise<void> {
  const { error } = await getClient().from("app_errors").insert({ app_version: row.appVersion, name: row.name, stack: row.stack });
  if (error) throw new Error(`logAppError failed: ${error.message}`);
}

export type AnalyticsEventType =
  | "account_created"
  | "account_deleted"
  | "item_saved"
  // The way to Pro. `detail` says which plan or which screen, never anything
  // the person wrote.
  | "quota_hit"
  | "paywall_view"
  | "purchase_started"
  | "purchase_done"
  // A step on the way failed: detail is "<step>:<status or error class>".
  | "purchase_failed"
  | "purchase_refunded"
  | "subscription_canceled"
  | "subscription_expired";

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  userId: string;
  category?: Category;
  source?: ItemSource;
  detail?: string;
}

// One-way stand-in for the account: the same user always hashes to the same
// pseudonym (so "this pseudonym saved 20 things this week" or "came back
// after 10 days" is answerable), but the hash can't be reversed back to an
// account id -- including after that account is deleted and its id stops
// existing anywhere else. That's what keeps analytics_events out from under
// PIPA's "personal information" umbrella despite still telling users apart.
function pseudonymize(userId: string): string {
  return createHmac("sha256", required("ANALYTICS_HASH_SECRET")).update(userId).digest("hex");
}

// Deliberately logs nothing beyond event type + category/source + a
// pseudonym: no titles, no raw text, no ids traceable to the account. Best
// effort and non-throwing -- a broken analytics insert should never fail
// the request it's attached to.
export async function logAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const { error } = await getClient()
      .from("analytics_events")
      .insert({
        pseudonym: pseudonymize(event.userId),
        event_type: event.eventType,
        category: event.category ?? null,
        source: event.source ?? null,
        detail: event.detail ?? null,
      });
    if (error) throw error;
  } catch (err) {
    console.error("logAnalyticsEvent failed:", err);
  }
}
