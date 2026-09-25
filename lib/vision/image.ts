import sharp from "sharp";

export const MAX_EDGE = 1568;

export type PreparedImage = {
  base64: string;
  buffer: Buffer;
  sentW: number;
  sentH: number;
};

export async function prepareImage(png: Buffer): Promise<PreparedImage> {
  const buffer = await sharp(png)
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    base64: buffer.toString("base64"),
    buffer,
    sentW: meta.width ?? 0,
    sentH: meta.height ?? 0,
  };
}
