// npm test -- what a saved link is allowed to reach, and how much of it is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { fetchPublicHtml, isPublicAddress } from "./safeFetch.js";

const limits = { timeoutMs: 2000, maxBytes: 1000, maxRedirects: 3 };
const local = { ...limits, isAllowed: () => true };

async function serve(handler: http.RequestListener, run: (base: string) => Promise<void>) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test("private, loopback and link-local addresses are not public", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "168.110.25.49", "172.32.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test("a URL pointing inside is refused before anything is sent", async () => {
  let hits = 0;
  await serve(
    (_req, res) => {
      hits++;
      res.end("<title>inside</title>");
    },
    async (base) => {
      const port = new URL(base).port;
      for (const host of ["127.0.0.1", "localhost", "[::ffff:127.0.0.1]", "2130706433"]) {
        assert.equal(await fetchPublicHtml(`http://${host}:${port}/`, {}, limits), null, host);
      }
    }
  );
  assert.equal(hits, 0);
});

test("a redirect can't lead inside", async () => {
  await serve(
    (_req, res) => {
      res.writeHead(302, { location: "http://127.0.0.1:1/" }).end();
    },
    async (base) => {
      let calls = 0;
      const isAllowed = () => calls++ === 0;
      assert.equal(await fetchPublicHtml(base, {}, { ...limits, isAllowed }), null);
      assert.equal(calls, 2);
    }
  );
});

test("reads only up to the limit and stops a page that never ends", async () => {
  let closed = false;
  await serve(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      const timer = setInterval(() => res.write("x".repeat(500)), 1);
      res.on("close", () => {
        clearInterval(timer);
        closed = true;
      });
    },
    async (base) => {
      const html = await fetchPublicHtml(base, {}, local);
      assert.equal(html?.length, 1000);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(closed, true);
    }
  );
});

test("the limit counts unpacked bytes", async () => {
  await serve(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" });
      res.end(gzipSync("y".repeat(50_000)));
    },
    async (base) => {
      assert.equal((await fetchPublicHtml(base, {}, local))?.length, 1000);
    }
  );
});

test("follows three redirects, not four", async () => {
  await serve(
    (req, res) => {
      const n = Number(req.url?.slice(1) || 0);
      if (n > 0) {
        res.writeHead(302, { location: `/${n - 1}` }).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" }).end("<title>end</title>");
    },
    async (base) => {
      assert.equal(await fetchPublicHtml(`${base}/3`, {}, local), "<title>end</title>");
      assert.equal(await fetchPublicHtml(`${base}/4`, {}, local), null);
    }
  );
});

test("a slow page gives up at the deadline; non-HTML is never read", async () => {
  await serve(
    (req, res) => {
      if (req.url === "/pdf") {
        res.writeHead(200, { "content-type": "application/pdf" }).end("x");
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.write("partial");
    },
    async (base) => {
      assert.equal(await fetchPublicHtml(`${base}/pdf`, {}, local), null);
      assert.equal(await fetchPublicHtml(base, {}, { ...local, timeoutMs: 200 }), null);
    }
  );
});
