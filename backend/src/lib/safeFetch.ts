import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

// Fetching a URL someone saved: never the server's own network, never more
// than a preview needs. One huge page used to run the 1GB VM out of memory,
// and the row stayed 'pending', so every restart read it again and died again.

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, bits, "ipv6");
}

// BlockList also applies the IPv4 rules to IPv4-mapped IPv6 (::ffff:127.0.0.1).
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 6 ? "ipv6" : "ipv4");
}

export interface HtmlLimits {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  // Tests point this at a local server; everything else keeps the default.
  isAllowed?: (ip: string) => boolean;
}

// The check sits in the socket's own lookup rather than in a look-up before
// the request, so a name that answers differently the second time can't get
// through. An IP in the URL never reaches a lookup, so it's checked directly.
function open(url: URL, signal: AbortSignal, headers: Record<string, string>, isAllowed: (ip: string) => boolean): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new Error("unsupported protocol"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isAllowed(host)) return reject(new Error("address not allowed"));
    const lookup = (hostname: string, options: object, cb: (...args: unknown[]) => void) => {
      dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
        if (err) return cb(err);
        if (addresses.length === 0 || addresses.some((a) => !isAllowed(a.address))) return cb(new Error("address not allowed"));
        if ((options as { all?: boolean }).all) return cb(null, addresses);
        cb(null, addresses[0].address, addresses[0].family);
      });
    };
    const get = url.protocol === "https:" ? https.get : http.get;
    get(url, { lookup: lookup as never, signal, headers }, resolve).on("error", reject);
  });
}

function decoderFor(encoding: string | undefined) {
  if (encoding === "gzip" || encoding === "x-gzip") return createGunzip();
  if (encoding === "deflate") return createInflate();
  if (encoding === "br") return createBrotliDecompress();
  return null;
}

// The first maxBytes of the page; the rest is never read. The limit counts
// bytes after decompression, so a small gzip can't unpack into a huge page.
async function readCapped(res: IncomingMessage, maxBytes: number): Promise<string> {
  const decoder = decoderFor(res.headers["content-encoding"]?.toLowerCase());
  const body = decoder ? pipeline(res, decoder, () => {}) : res;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    total += chunk.length;
    if (total >= maxBytes) break;
  }
  res.destroy();
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
}

// The page at `url` (redirects followed by hand, each hop checked), or null
// when it isn't a readable public HTML page. Never throws.
export async function fetchPublicHtml(url: string, headers: Record<string, string>, limits: HtmlLimits): Promise<string | null> {
  const signal = AbortSignal.timeout(limits.timeoutMs);
  try {
    let current = new URL(url);
    for (let hop = 0; hop <= limits.maxRedirects; hop++) {
      const res = await open(current, signal, { "accept-encoding": "identity", ...headers }, limits.isAllowed ?? isPublicAddress);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.destroy();
        current = new URL(res.headers.location, current);
        continue;
      }
      if (status < 200 || status >= 300 || !(res.headers["content-type"] ?? "").includes("text/html")) {
        res.destroy();
        return null;
      }
      return await readCapped(res, limits.maxBytes);
    }
    return null;
  } catch {
    return null;
  }
}
