import sharp from "sharp";

export const MIRROR_WIDTH = 540;
export const MIRROR_QUALITY = 60;

export type ImageSize = { width: number; height: number };

export async function imageSize(png: Buffer): Promise<ImageSize> {
  const meta = await sharp(png).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

export async function toMirrorJpeg(png: Buffer): Promise<Buffer> {
  return sharp(png)
    .resize({ width: MIRROR_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: MIRROR_QUALITY })
    .toBuffer();
}
