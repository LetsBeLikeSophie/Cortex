import sharp from "sharp";

// One 1 OCPU / 1GB box: images decode one at a time, nothing kept in memory.
sharp.concurrency(1);
sharp.cache(false);

// Decoding takes about 3 bytes a pixel, so the default limit (about 270
// million) can use most of the VM. A 50MP camera photo still passes.
const MAX_INPUT_PIXELS = 100_000_000;

// Bounds both Storage growth and Claude vision cost, which scale with image
// size -- downscale-only (a small screenshot stays as-is) and re-encoded as
// JPEG so both the stored copy and the classification call use the smaller
// version, regardless of the original format.
//
// The cap is on the LONG edge, matched to what Claude actually looks at
// (it scales anything past ~1568px on the long edge down itself). A width
// cap did almost nothing for phone screenshots, which are tall (1080x2400
// stayed 1080x2400 and the AI threw the extra resolution away). 1600 long /
// q75 halves a typical screenshot (~277KB -> ~120KB) with the same image
// for classification; going lower would start blurring small text.
const SCREENSHOT_MAX_EDGE = 1600;
const SCREENSHOT_JPEG_QUALITY = 75;

// An upload that can't ever be processed: the route answers with this status
// and the share queue stops retrying it.
export class ImageRejectedError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string
  ) {
    super(message);
  }
}

export async function compressScreenshot(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // apply EXIF orientation before resizing (camera photos)
      .resize({ width: SCREENSHOT_MAX_EDGE, height: SCREENSHOT_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: SCREENSHOT_JPEG_QUALITY })
      .toBuffer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/pixel limit/i.test(message)) throw new ImageRejectedError(413, "image too large");
    throw new ImageRejectedError(400, "unreadable image");
  }
}
