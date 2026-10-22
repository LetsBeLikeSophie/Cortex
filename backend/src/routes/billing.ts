import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { resolveUserId } from "../lib/auth.js";
import { getEntitlement } from "../lib/plans.js";
import { isPlayBillingConfigured, PlayApiError } from "../lib/googlePlay.js";
import {
  PurchaseConflictError,
  UnknownProductError,
  applyGooglePurchase,
  lifetimeRemaining,
  refreshGooglePurchase,
} from "../lib/billing.js";

const VerifySchema = z.object({
  productId: z.string().min(1).max(100),
  purchaseToken: z.string().min(1).max(2000),
});

// Pub/Sub push body for Play real-time developer notifications.
const RtdnSchema = z.object({
  message: z.object({ data: z.string() }),
});

export async function billingRoutes(app: FastifyInstance) {
  // What the paywall can offer right now: whether store billing is set up
  // on the server, the product ids to load from Play, and how many lifetime
  // passes are left (the option is hidden at 0).
  app.get("/billing/offers", async (req, reply) => {
    await resolveUserId(req);
    const enabled = isPlayBillingConfigured();
    return reply.send({
      enabled,
      subscriptionId: config.playSubscriptionId,
      lifetimeId: config.playLifetimeId,
      lifetimeRemaining: enabled ? await lifetimeRemaining() : 0,
    });
  });

  // The app hands over a Play purchase; the server checks it with Google,
  // acknowledges it and updates pro_until. Returns the new entitlement.
  app.post("/billing/google/verify", async (req, reply) => {
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    if (!isPlayBillingConfigured()) return reply.code(503).send({ error: "billing_unavailable" });
    const userId = await resolveUserId(req);
    try {
      await applyGooglePurchase(userId, parsed.data.productId, parsed.data.purchaseToken);
    } catch (err) {
      if (err instanceof PurchaseConflictError) return reply.code(409).send({ error: "purchase_other_account" });
      if (err instanceof UnknownProductError) return reply.code(400).send({ error: "unknown_product" });
      if (err instanceof PlayApiError && (err.status === 400 || err.status === 404 || err.status === 410)) {
        return reply.code(400).send({ error: "invalid_purchase" });
      }
      throw err;
    }
    return reply.send(await getEntitlement(userId));
  });

  // Real-time developer notifications (renewals, cancellations, refunds),
  // pushed by a Pub/Sub subscription whose URL carries ?secret=. Always 200
  // once the secret checks out, so a purchase we can't process doesn't make
  // Pub/Sub redeliver it forever; failures are logged.
  app.post("/billing/google/rtdn", async (req, reply) => {
    const secret = (req.query as { secret?: string }).secret;
    if (!config.playRtdnSecret || secret !== config.playRtdnSecret) return reply.code(403).send({ error: "forbidden" });
    const parsed = RtdnSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(200).send({ ok: true });
    try {
      const note = JSON.parse(Buffer.from(parsed.data.message.data, "base64").toString("utf8")) as {
        subscriptionNotification?: { purchaseToken: string };
        oneTimeProductNotification?: { purchaseToken: string };
        voidedPurchaseNotification?: { purchaseToken: string };
      };
      const token =
        note.subscriptionNotification?.purchaseToken ??
        note.oneTimeProductNotification?.purchaseToken ??
        note.voidedPurchaseNotification?.purchaseToken;
      if (token) await refreshGooglePurchase(token, !!note.voidedPurchaseNotification);
    } catch (err) {
      req.log.error(err, "rtdn handling failed");
    }
    return reply.code(200).send({ ok: true });
  });
}
