import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import formbody from "@fastify/formbody";
import { config } from "./config.js";
import { itemsRoutes } from "./routes/items.js";
import { authRoutes } from "./routes/auth.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { billingRoutes } from "./routes/billing.js";
import { resumePendingClassifications } from "./lib/pipeline.js";
import { startRetentionJob } from "./lib/retention.js";

// Base64 inflates bytes by ~33%, so give Fastify's own body-size cap enough
// headroom above maxImageBytes that our friendlier "image too large" check
// (routes/items.ts) is the one that actually fires, not Fastify's generic
// FST_ERR_CTP_BODY_TOO_LARGE.
// Request logs keep the path only: query strings carry the billing
// webhook's ?secret= and people's search words.
const app = Fastify({
  logger: {
    serializers: {
      req: (req) => ({ method: req.method, url: req.url.split("?")[0], host: req.host, remoteAddress: req.ip }),
    },
  },
  bodyLimit: Math.ceil(config.maxImageBytes * 2),
});

// The plugin's default is GET/HEAD/POST only -- the web app's PATCH (edit
// title/memo) and DELETE (trash) were blocked at the preflight.
await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"] });
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
await app.register(billingRoutes);

app.listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    // Classification jobs live in memory; re-queue anything a restart left
    // at "분석 중". Best-effort -- never blocks or fails startup.
    if (config.hasSupabase) {
      startRetentionJob({
        info: (msg) => app.log.info(msg),
        error: (err, msg) => app.log.error(err, msg),
      });
    }
    if (config.hasSupabase && config.hasAnthropicKey) {
      resumePendingClassifications()
        .then((n) => n > 0 && app.log.info(`re-queued ${n} pending classification(s)`))
        .catch((err) => app.log.error(err, "resumePendingClassifications failed"));
    }
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
