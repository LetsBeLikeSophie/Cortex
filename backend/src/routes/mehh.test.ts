// npm test -- POST /mehh/screenshots/analyze with fake Google / Claude / DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { mehhRoutes, type MehhDeps } from "./mehh.js";

class NotPro extends Error {}
class Rejected extends Error {
  constructor(readonly status: 400 | 413) {
    super("rejected");
  }
}

function fakes(over: Partial<MehhDeps> = {}) {
  const log = { reserved: [] as number[], refunded: [] as number[], analyzed: [] as number[] };
  let used = 0;
  const deps: MehhDeps = {
    billingReady: () => true,
    aiReady: () => true,
    purchaseKey: (t) => `k:${t}`,
    requirePro: async (t) => {
      if (t !== "good") throw new NotPro();
    },
    NotPro,
    prepare: async (b) => {
      if (b.toString() === "bad") throw new Rejected(400);
      return b;
    },
    isImageRejected: (e): e is Rejected => e instanceof Rejected,
    reserve: async (_k, asked) => {
      const granted = Math.max(0, Math.min(asked, 12 - used));
      used += granted;
      log.reserved.push(granted);
      return { id: granted ? log.reserved.length : null, granted, used, limit: 12, resetsAt: "2026-11-30T15:00:00.000Z" };
    },
    refund: async (id) => {
      log.refunded.push(id);
    },
    assertAiOpen: async () => {},
    isAiUnavailable: () => false,
    analyze: async (imgs) => {
      log.analyzed.push(imgs.length);
      return imgs.map((_, index) => ({ index, verdict: "useless", reason: "temporary_info" }));
    },
    rateLimitMax: 100,
    rateLimitWindowMs: 60_000,
    ...over,
  };
  return { deps, log };
}

async function app(deps: MehhDeps) {
  const a = Fastify();
  await a.register(rateLimit, { global: false, hook: "preHandler" }); // as in server.ts: body parsed first
  await a.register(mehhRoutes(deps));
  return a;
}

const img = (s = "jpegbytes") => Buffer.from(s).toString("base64");
const body = (n: number, token = "good") => ({
  purchaseToken: token,
  today: "2026-11-08",
  photos: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, image: img() })),
});
const post = (a: Awaited<ReturnType<typeof app>>, payload: object) =>
  a.inject({ method: "POST", url: "/mehh/screenshots/analyze", payload });

test("Pro gets one verdict per photo and this month's count", async () => {
  const { deps } = fakes();
  const res = await post(await app(deps), body(3));
  assert.equal(res.statusCode, 200);
  const j = res.json();
  assert.equal(j.results.length, 3);
  assert.deepEqual(j.results[0], { id: "p0", verdict: "useless", reason: "temporary_info" });
  assert.deepEqual(j.skipped, []);
  assert.deepEqual(j.usage, { used: 3, limit: 12, resetsAt: "2026-11-30T15:00:00.000Z" });
});

test("not Pro (never bought, or refunded): 401 and nothing counted", async () => {
  const { deps, log } = fakes();
  const res = await post(await app(deps), body(2, "refunded"));
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "not_pro");
  assert.deepEqual(log.reserved, []);
});

test("Google down: 503 billing_unavailable, not 'not Pro'", async () => {
  const { deps } = fakes({
    requirePro: async () => {
      throw new Error("timeout");
    },
  });
  const res = await post(await app(deps), body(1));
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "billing_unavailable");
});

test("over the cap: the rest of the batch is skipped, then 402", async () => {
  const { deps, log } = fakes();
  const a = await app(deps);
  assert.equal((await post(a, body(10))).statusCode, 200);
  const second = (await post(a, body(5))).json();
  assert.equal(second.results.length, 2);
  assert.deepEqual(second.skipped, ["p2", "p3", "p4"]);
  assert.deepEqual(log.analyzed, [10, 2]);
  const third = await post(a, body(1));
  assert.equal(third.statusCode, 402);
  assert.equal(third.json().error, "quota");
  assert.equal(third.json().limit, 12);
});

test("AI fails: the photos are handed back and the error says to retry", async () => {
  const { deps, log } = fakes({
    analyze: async () => {
      throw new Error("overloaded");
    },
  });
  const res = await post(await app(deps), body(4));
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error, "ai_failed");
  assert.deepEqual(log.refunded, [1]);
});

test("AI credit gone or daily ceiling: 503 ai_unavailable, refunded / not counted", async () => {
  const { deps, log } = fakes({
    analyze: async () => {
      throw new Error("credit");
    },
    isAiUnavailable: () => true,
  });
  const res = await post(await app(deps), body(1));
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "ai_unavailable");
  assert.deepEqual(log.refunded, [1]);
  const ceiling = fakes({
    assertAiOpen: async () => {
      throw new Error("over");
    },
  });
  const r2 = await post(await app(ceiling.deps), body(1));
  assert.equal(r2.statusCode, 503);
  assert.deepEqual(ceiling.log.reserved, []);
});

test("a bad image is refused before anything is counted", async () => {
  const { deps, log } = fakes();
  const b = body(2);
  b.photos[1].image = img("bad");
  const res = await post(await app(deps), b);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "unreadable_image");
  assert.deepEqual(log.reserved, []);
});

test("malformed bodies: too many photos, a path as id, duplicate ids, no date", async () => {
  const { deps } = fakes();
  const a = await app(deps);
  assert.equal((await post(a, body(11))).statusCode, 400);
  const pathId = body(1);
  pathId.photos[0].id = "/sdcard/DCIM/a.jpg";
  assert.equal((await post(a, pathId)).statusCode, 400);
  const dup = body(2);
  dup.photos[1].id = "p0";
  assert.equal((await post(a, dup)).statusCode, 400);
  const { today: _t, ...noDate } = body(1);
  assert.equal((await post(a, noDate)).statusCode, 400);
});

test("rate limit counts per purchase", async () => {
  const { deps } = fakes({ rateLimitMax: 2 });
  const a = await app(deps);
  assert.equal((await post(a, body(1))).statusCode, 200);
  assert.equal((await post(a, body(1))).statusCode, 200);
  assert.equal((await post(a, body(1))).statusCode, 429);
  assert.equal((await post(a, body(1, "other"))).statusCode, 401); // another purchase has its own count
});
