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

// Burst protection for the one expensive route (POST /items, which calls
// Claude) -- keyed by IP since there's no per-user key to use before auth
// resolves. The daily quota in routes/items.ts catches steady (non-burst)
// abuse this doesn't. global:false + registering here (before the routes)
// means nothing is throttled unless a route opts in via
// { config: { rateLimit: {} } } -- see routes/items.ts's POST /items.
// This used to be registered as the app-wide default, which meant every
// read (list/search/stats/tags/screenshot-url) shared the same 30-per-15min
// budget as the AI-classification endpoint -- easy to exhaust just by
// browsing, which read as the whole app being slow/broken rather than what
// it actually was, silent 429s.
await app.register(rateLimit, {
  global: false,
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
