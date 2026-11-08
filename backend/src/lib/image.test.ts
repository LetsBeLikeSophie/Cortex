// npm test -- what the image step does with oversized and broken uploads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { compressScreenshot, ImageRejectedError, MEHH_THUMB_MAX_EDGE, prepareMehhThumbnail } from "./image.js";

// A real small PNG whose header claims other dimensions: the size check reads
// only the header, so no test has to hold 16000x16000 pixels in memory.
async function pngClaiming(width: number, height: number): Promise<Buffer> {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#888" } }).png().toBuffer();
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

test("over 100 million pixels: refused as too large", async () => {
  await assert.rejects(compressScreenshot(await pngClaiming(16000, 16000)), (e: unknown) => e instanceof ImageRejectedError && e.status === 413);
});

test("not an image: refused as unreadable", async () => {
  await assert.rejects(compressScreenshot(Buffer.from("not an image")), (e: unknown) => e instanceof ImageRejectedError && e.status === 400);
});

test("a normal image comes back as a JPEG inside the long-edge cap", async () => {
  const input = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#888" } }).png().toBuffer();
  const meta = await sharp(await compressScreenshot(input)).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 1600);
});

test("a Mehh thumbnail loses its metadata and is cut to 768 on the long edge", async () => {
  const withExif = await sharp({ create: { width: 500, height: 1100, channels: 3, background: "#ccc" } })
    .withMetadata({ exif: { IFD0: { Make: "PhoneMaker", Model: "X1" } } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(withExif).metadata()).exif);
  const out = await prepareMehhThumbnail(withExif);
  const meta = await sharp(out).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(Math.max(meta.width!, meta.height!), MEHH_THUMB_MAX_EDGE);
});

test("a Mehh thumbnail that isn't small, or isn't an image, is refused", async () => {
  await assert.rejects(prepareMehhThumbnail(Buffer.alloc(301 * 1024)), (e: unknown) => e instanceof ImageRejectedError && e.status === 413);
  await assert.rejects(prepareMehhThumbnail(Buffer.from("not an image")), (e: unknown) => e instanceof ImageRejectedError && e.status === 400);
});
