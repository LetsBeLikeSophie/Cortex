// npm test -- POST /mehh/screenshots/analyze with fake Google / Claude / DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { mehhRoutes, type MehhDeps } from "./mehh.js";

class NotPro extends Error {}
class NotVerified extends Error {}
class Rejected extends Error {
  constructor(readonly status: 400 | 413) {
    super("rejected");
  }
}

function fakes(over: Partial<MehhDeps> = {}) {
  const log = {
    reserved: [] as number[],
    refunded: [] as number[],
    analyzed: [] as number[],
    kinds: [] as string[],
    freeRefunded: [] as number[],
  };
  let used = 0;
  // Free coins: 3 per install, sessions of 4 photos (small, for the tests).
  const coins = new Map<string, number>();
  const sessions = new Map<string, number>();
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
    analyze: async (imgs, _today, kind) => {
      log.analyzed.push(imgs.length);
      log.kinds.push(kind);
      return imgs.map((_, index) => ({ index, verdict: "useless", reason: "temporary_info" }));
    },
    integrityReady: () => true,
    verifyFree: async (_id, _nonce, token) => {
      if (token === "google-down") throw new Error("timeout");
      if (token !== "real-device") throw new NotVerified();
    },
    NotVerified,
    startFree: async (installId) => {
      const left = coins.get(installId) ?? 3;
      if (left === 0) return { session: null, coins: 0, nextCoinAt: "2026-11-30T15:00:00.000Z" };
      coins.set(installId, left - 1);
      const id = `00000000-0000-4000-8000-00000000000${sessions.size}`;
      sessions.set(id, 0);
      return { session: id, coins: left - 1, nextCoinAt: "2026-11-30T15:00:00.000Z" };
    },
    reserveFree: async (session, asked) => {
      const u = sessions.get(session);
      if (u === undefined) return { granted: 0, used: 0, limit: 4, resetsAt: "x" };
      const granted = Math.max(0, Math.min(asked, 4 - u));
      sessions.set(session, u + granted);
      return { granted, used: u + granted, limit: 4, resetsAt: "x" };
    },
    refundFree: async (_s, n) => {
      log.freeRefunded.push(n);
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

test("the product is checked as sent: 3-month Pro as trial, none (older Mehh) as lifetime, others refused", async () => {
  const seen: string[] = [];
  const { deps } = fakes({
    requirePro: async (_t, _k, product) => {
      seen.push(product);
    },
  });
  const a = await app(deps);
  assert.equal((await post(a, { ...body(1), productId: "mehh_pro_3months" })).statusCode, 200);
  assert.equal((await post(a, body(1))).statusCode, 200);
  assert.equal((await post(a, { ...body(1), productId: "cortex_lifetime" })).statusCode, 400);
  assert.deepEqual(seen, ["trial", "lifetime"]);
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

const start = (installId = "install-aaaaaaaaaaaa", token = "real-device", kind = "day") => ({
  installId,
  nonce: "nonce-bbbbbbbbbbbbbbbb",
  integrityToken: token,
  kind,
});
const startFree = (a: Awaited<ReturnType<typeof app>>, payload: object) =>
  a.inject({ method: "POST", url: "/mehh/free/start", payload });
const freeBody = (n: number, session: string, kind = "day") => ({
  session,
  kind,
  today: "2026-11-14",
  photos: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, image: img() })),
});

test("free: a real device spends a coin on a session, then analyzes a day set in it", async () => {
  const { deps, log } = fakes();
  const a = await app(deps);
  const r = await startFree(a, start());
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().coins, 2);
  const res = await post(a, freeBody(3, r.json().session));
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().results.length, 3);
  assert.deepEqual(log.kinds, ["day"]);
  assert.deepEqual(res.json().usage, { used: 3, limit: 4, resetsAt: "x" });
});

test("free: the session ends at its photo cap (quota), a new coin opens a new one", async () => {
  const { deps } = fakes();
  const a = await app(deps);
  const s1 = (await startFree(a, start())).json().session;
  const first = (await post(a, freeBody(6, s1))).json();
  assert.equal(first.results.length, 4);
  assert.deepEqual(first.skipped, ["p4", "p5"]);
  assert.equal((await post(a, freeBody(1, s1))).statusCode, 402);
  const s2 = (await startFree(a, start())).json().session;
  assert.notEqual(s2, s1);
  assert.equal((await post(a, freeBody(1, s2))).statusCode, 200);
});

test("free: no coin left is 402 no_coins with the next coin's date", async () => {
  const { deps } = fakes();
  const a = await app(deps);
  for (let i = 0; i < 3; i++) assert.equal((await startFree(a, start())).statusCode, 200);
  const r = await startFree(a, start());
  assert.equal(r.statusCode, 402);
  assert.equal(r.json().error, "no_coins");
  assert.equal(r.json().nextCoinAt, "2026-11-30T15:00:00.000Z");
  // Another install has its own coins.
  assert.equal((await startFree(a, start("install-cccccccccccc"))).statusCode, 200);
});

test("free: emulator / not from Play is 403 not_verified, Google down is 503, nothing spent", async () => {
  const { deps } = fakes();
  const a = await app(deps);
  const bad = await startFree(a, start("install-aaaaaaaaaaaa", "emulator"));
  assert.equal(bad.statusCode, 403);
  assert.equal(bad.json().error, "not_verified");
  const down = await startFree(a, start("install-aaaaaaaaaaaa", "google-down"));
  assert.equal(down.statusCode, 503);
  assert.equal(down.json().error, "integrity_unavailable");
  assert.equal((await startFree(a, start())).json().coins, 2); // still 3 before this one
});

test("free: AI failure gives the session's photos back", async () => {
  const { deps, log } = fakes({
    analyze: async () => {
      throw new Error("boom");
    },
  });
  const a = await app(deps);
  const s = (await startFree(a, start())).json().session;
  assert.equal((await post(a, freeBody(2, s))).statusCode, 502);
  assert.deepEqual(log.freeRefunded, [2]);
});

test("a request with both a purchase token and a session, or neither, is refused", async () => {
  const { deps } = fakes();
  const a = await app(deps);
  const s = (await startFree(a, start())).json().session;
  assert.equal((await post(a, { ...freeBody(1, s), purchaseToken: "good" })).statusCode, 400);
  const { session: _drop, ...neither } = freeBody(1, s);
  assert.equal((await post(a, neither)).statusCode, 400);
});

test("screenshots stay the default kind (older Mehh sends none)", async () => {
  const { deps, log } = fakes();
  await post(await app(deps), body(1));
  assert.deepEqual(log.kinds, ["screenshots"]);
});
