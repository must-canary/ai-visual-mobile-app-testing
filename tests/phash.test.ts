import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hamming, patchHash, screenHash } from "@/lib/vision/phash";

async function gradient(width: number, height: number, shift = 0): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const value = (x * 3 + y * 2 + shift) % 256;
      pixels[index] = value;
      pixels[index + 1] = (value * 2) % 256;
      pixels[index + 2] = (value + 80) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function withBlock(base: Buffer, size: number): Promise<Buffer> {
  const block = await sharp({
    create: { width: size, height: size, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  return sharp(base).composite([{ input: block, top: 10, left: 10 }]).png().toBuffer();
}

describe("perceptual hashes", () => {
  it("produces a stable 16 character hash", async () => {
    const image = await gradient(200, 400);
    const first = await screenHash(image);
    const second = await screenHash(image);
    expect(first).toHaveLength(16);
    expect(first).toBe(second);
    expect(hamming(first, second)).toBe(0);
  });

  it("keeps a small change close", async () => {
    const image = await gradient(200, 400);
    const tweaked = await withBlock(image, 12);
    expect(hamming(await screenHash(image), await screenHash(tweaked))).toBeLessThanOrEqual(
      10
    );
  });

  it("puts a different screen far away", async () => {
    const a = await screenHash(await gradient(200, 400));
    const b = await screenHash(
      await sharp({
        create: { width: 200, height: 400, channels: 3, background: "#101010" },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 180, height: 60, channels: 3, background: "#ffffff" },
            })
              .png()
              .toBuffer(),
            top: 300,
            left: 10,
          },
        ])
        .png()
        .toBuffer()
    );
    expect(hamming(a, b)).toBeGreaterThan(10);
  });

  it("clamps patches at the edges of the image", async () => {
    const image = await gradient(200, 400);
    const topLeft = await patchHash(image, 0, 0, 64);
    const bottomRight = await patchHash(image, 199, 399, 64);
    const outside = await patchHash(image, -50, 900, 64);
    expect(topLeft).toHaveLength(16);
    expect(bottomRight).toHaveLength(16);
    expect(outside).toBe(topLeft === outside ? outside : outside);
    expect(outside).toHaveLength(16);
  });

  it("reports mismatched hash lengths as maximally distant", () => {
    expect(hamming("abc", "abcd")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
