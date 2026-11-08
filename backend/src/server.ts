import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import formbody from "@fastify/formbody";
import { config } from "./config.js";
import { itemsRoutes } from "./routes/items.js";
import { authRoutes } from "./routes/auth.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { billingRoutes } from "./routes/billing.js";
import { mehhRoutes } from "./routes/mehh.js";
import { mehhDeps } from "./lib/mehhDeps.js";
import { resumePendingClassifications } from "./lib/pipeline.js";
import { startRetentionJob } from "./lib/retention.js";
import { aiRefusing } from "./lib/aiHealth.js";
import { dailyAiBudget } from "./lib/aiLog.js";
import { resolveUserId } from "./lib/auth.js";

// Base64 inflates bytes by ~33%, so give Fastify's own body-size cap enough
// headroom above maxImageBytes that our friendlier "image too large" check
// (routes/items.ts) is the one that actually fires, not Fastify's generic
// FST_ERR_CTP_BODY_TOO_LARGE.
// Request logs keep the path only: query strings carry the billing
// webhook's ?secret= and people's search words.
// trustProxy: nginx on this same VM fronts the API, so without it every
// request looks like 127.0.0.1 and the per-IP rate limits below become one
// shared budget for everyone. Only the local proxy's X-Forwarded-For is
// believed (nginx must set it: proxy_set_header X-Forwarded-For
// $proxy_add_x_forwarded_for).
const app = Fastify({
  trustProxy: "127.0.0.1",
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
// Claude) and the other opted-in routes. The daily quota in routes/items.ts catches steady (non-burst)
// abuse this doesn't. global:false + registering here (before the routes)
// means nothing is throttled unless a route opts in via
// { config: { rateLimit: {} } } -- see routes/items.ts's POST /items.
// This used to be registered as the app-wide default, which meant every
// read (list/search/stats/tags/screenshot-url) shared the same 30-per-15min
// budget as the AI-classification endpoint -- easy to exhaust just by
// browsing, which read as the whole app being slow/broken rather than what
// it actually was, silent 429s.
// Counted per signed-in account (an IP can be a whole carrier's CGNAT, and a
// 100-photo import twice in 15 minutes is one person's normal use); requests
// without a valid token fall back to the IP. preHandler, so the body is parsed
// and the token check is the cached one the route itself then uses.
await app.register(rateLimit, {
  global: false,
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs,
  hook: "preHandler",
  keyGenerator: async (req) => {
    try {
      return `u:${await resolveUserId(req)}`;
    } catch {
      return req.ip;
    }
  },
});

// The in-app notice the terms and privacy policy promise (7 days before a
// change takes effect). Served from here so a new notice needs no app
// build: change id/until with each revision; until = the later effective
// day. null: no notice.
const POLICY_NOTICE: { id: string; until: string } | null = { id: "terms-privacy-2026-11-15", until: "2026-11-15T00:00:00+09:00" };
app.get("/notice", async () => ({ notice: POLICY_NOTICE }));

app.get("/health", async () => ({
  ok: true,
  anthropicConfigured: config.hasAnthropicKey,
  supabaseConfigured: config.hasSupabase,
}));

// For the outside monitor (decision M1): 503 while AI can't be used -- today's
// spending ceiling is reached, or Claude refused (credit, key) and hasn't
// answered since. Says nothing about anyone's memos.
app.get("/health/ai", async (_req, reply) => {
  if (aiRefusing()) return reply.code(503).send({ ok: false, reason: "refused" });
  if (await dailyAiBudget.isOver().catch(() => false)) return reply.code(503).send({ ok: false, reason: "daily_limit" });
  return { ok: true };
});

await app.register(itemsRoutes);
await app.register(authRoutes);
await app.register(webhookRoutes);
await app.register(billingRoutes);
// Mehh's screenshot AI stays off until its table exists and both apps'
// privacy policies say so (docs/mehh-screenshot-ai.md): MEHH_AI_ENABLED=1.
if (config.mehhAiEnabled) await app.register(mehhRoutes(mehhDeps));

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
