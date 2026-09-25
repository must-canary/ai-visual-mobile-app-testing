import sharp from "sharp";

const HASH_W = 9;
const HASH_H = 8;

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble =
      (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

async function dhash(image: sharp.Sharp): Promise<string> {
  const raw = await image
    .grayscale()
    .resize(HASH_W, HASH_H, { fit: "fill" })
    .raw()
    .toBuffer();
  const bits: number[] = [];
  for (let row = 0; row < HASH_H; row += 1) {
    for (let col = 0; col < HASH_W - 1; col += 1) {
      const left = raw[row * HASH_W + col];
      const right = raw[row * HASH_W + col + 1];
      bits.push(left > right ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

export async function screenHash(png: Buffer): Promise<string> {
  return dhash(sharp(png));
}

export async function patchHash(
  png: Buffer,
  x: number,
  y: number,
  size: number
): Promise<string> {
  const image = sharp(png);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) return "0".repeat(16);

  const half = Math.max(1, Math.round(size / 2));
  const boxW = Math.min(width, half * 2);
  const boxH = Math.min(height, half * 2);
  const left = Math.min(Math.max(0, Math.round(x) - half), width - boxW);
  const top = Math.min(Math.max(0, Math.round(y) - half), height - boxH);

  return dhash(
    sharp(png).extract({
      left,
      top,
      width: boxW,
      height: boxH,
    })
  );
}

const POPCOUNT = Array.from({ length: 16 }, (_, i) =>
  i.toString(2).split("").filter((b) => b === "1").length
);

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    total += POPCOUNT[diff];
  }
  return total;
}
