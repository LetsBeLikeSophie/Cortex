import type { FastifyReply } from "fastify";
import type { Entitlement, UsageKind } from "../lib/plans.js";
import { logAnalyticsEvent } from "../lib/supabase.js";

// This month's uses ran out: counted for the funnel, answered with 402 (the
// app opens Pro from it).
export async function quotaHit(reply: FastifyReply, userId: string, ent: Entitlement, kind: UsageKind) {
  await logAnalyticsEvent({ eventType: "quota_hit", userId, detail: kind });
  return reply.code(402).send({ error: "quota", kind, limit: ent[kind].limit, tier: ent.tier, resetsAt: ent.resetsAt });
}
