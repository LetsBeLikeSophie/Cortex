// The Supabase client (service role) and the screenshots bucket name.
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

export const SCREENSHOTS_BUCKET = "item-screenshots";

let client: SupabaseClient | null = null;

// Lazy singleton so the server can boot (and e.g. serve /health, or exercise
// the metadata fetcher) even before Supabase credentials are configured --
// only routes that actually touch the DB pay for the missing-config error.
export function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
  }
  return client;
}
