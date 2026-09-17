import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import formbody from "@fastify/formbody";
import { config } from "./config.js";
import { itemsRoutes } from "./routes/items.js";
import { authRoutes } from "./routes/auth.js";
import { webhookRoutes } from "./routes/webhooks.js";

// Base64 inflates bytes by ~33%, so give Fastify's own body-size cap enough
// headroom above maxImageBytes that our friendlier "image too large" check
// (routes/items.ts) is the one that actually fires, not Fastify's generic
// FST_ERR_CTP_BODY_TOO_LARGE.
const app = Fastify({ logger: true, bodyLimit: Math.ceil(config.maxImageBytes * 2) });

await app.register(cors, { origin: true });
// Kakao's unlink webhook posts application/x-www-form-urlencoded, not JSON.
await app.register(formbody);

// Burst protection -- keyed by IP since there's no auth yet to key by user.
// The daily quota in routes/items.ts catches steady (non-burst) abuse this
// doesn't.
await app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs,
});

app.get("/health", async () => ({
  ok: true,
  anthropicConfigured: config.hasAnthropicKey,
  supabaseConfigured: config.hasSupabase,
}));

await app.register(itemsRoutes);
await app.register(authRoutes);
await app.register(webhookRoutes);

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
