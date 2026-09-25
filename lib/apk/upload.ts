import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const UPLOAD_DIR = path.join("uploads", "apks");
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export type UploadedFile = {
  fieldName: string;
  originalName: string;
  relativePath: string;
  absolutePath: string;
  size: number;
};

export type UploadResult = {
  fields: Record<string, string>;
  file: UploadedFile | null;
};

class ChunkReader {
  private buf: Buffer = Buffer.alloc(0);
  private eof = false;

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  private async fill(): Promise<boolean> {
    if (this.eof) return false;
    const { done, value } = await this.reader.read();
    if (done) {
      this.eof = true;
      return false;
    }
    if (value && value.length > 0) {
      this.buf = Buffer.concat([this.buf, Buffer.from(value)]);
      return true;
    }
    return this.fill();
  }

  async ensure(length: number): Promise<boolean> {
    while (this.buf.length < length) {
      if (!(await this.fill())) return false;
    }
    return true;
  }

  peek(length: number): Buffer {
    return this.buf.subarray(0, length);
  }

  skip(length: number): void {
    this.buf = this.buf.subarray(length);
  }

  async readUntil(needle: Buffer, limit: number): Promise<Buffer> {
    for (;;) {
      const index = this.buf.indexOf(needle);
      if (index >= 0) {
        const out = this.buf.subarray(0, index);
        this.buf = this.buf.subarray(index + needle.length);
        return out;
      }
      if (this.buf.length > limit) {
        throw new Error("Malformed multipart upload");
      }
      if (!(await this.fill())) {
        throw new Error("Unexpected end of upload");
      }
    }
  }

  async streamUntil(
    needle: Buffer,
    write: (chunk: Buffer) => Promise<void>
  ): Promise<void> {
    const keep = needle.length - 1;
    for (;;) {
      const index = this.buf.indexOf(needle);
      if (index >= 0) {
        if (index > 0) await write(this.buf.subarray(0, index));
        this.buf = this.buf.subarray(index + needle.length);
        return;
      }
      if (this.buf.length > keep) {
        const flush = this.buf.subarray(0, this.buf.length - keep);
        this.buf = this.buf.subarray(this.buf.length - keep);
        await write(flush);
      }
      if (!(await this.fill())) {
        throw new Error("Unexpected end of upload");
      }
    }
  }
}

function boundaryOf(contentType: string | null): string {
  if (!contentType || !contentType.includes("multipart/form-data")) {
    throw new Error("Expected a multipart/form-data request");
  }
  const match =
    contentType.match(/boundary="([^"]+)"/) ?? contentType.match(/boundary=([^;]+)/);
  if (!match) throw new Error("Missing multipart boundary");
  return match[1].trim();
}

function parseDisposition(headers: string): {
  name: string;
  filename: string | null;
} {
  const line =
    headers
      .split(/\r\n/)
      .find((h) => /^content-disposition:/i.test(h)) ?? "";
  const name = line.match(/name="([^"]*)"/)?.[1] ?? "";
  const filename =
    line.match(/filename\*=UTF-8''([^;]+)/)?.[1] ??
    line.match(/filename="([^"]*)"/)?.[1] ??
    null;
  return {
    name,
    filename: filename ? decodeURIComponent(filename) : null,
  };
}

function safeName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, "_");
  return base.length > 0 ? base.slice(-120) : "upload.apk";
}

export async function receiveUpload(
  request: Request,
  maxBytes = MAX_UPLOAD_BYTES
): Promise<UploadResult> {
  if (!request.body) throw new Error("Empty request body");

  const boundary = boundaryOf(request.headers.get("content-type"));
  const delimiter = Buffer.from(`--${boundary}`);
  const partEnd = Buffer.from(`\r\n--${boundary}`);
  const headerEnd = Buffer.from("\r\n\r\n");

  const uploadRoot = path.resolve(process.cwd(), UPLOAD_DIR);
  await fs.mkdir(uploadRoot, { recursive: true });

  const reader = new ChunkReader(request.body.getReader());
  const fields: Record<string, string> = {};
  let file: UploadedFile | null = null;

  await reader.readUntil(delimiter, 1024 * 1024);

  for (;;) {
    if (!(await reader.ensure(2))) break;
    const next = reader.peek(2).toString("latin1");
    if (next === "--") break;
    reader.skip(2);

    const headers = (await reader.readUntil(headerEnd, 64 * 1024)).toString("utf8");
    const { name, filename } = parseDisposition(headers);

    if (!filename) {
      const value = await reader.readUntil(partEnd, 1024 * 1024);
      fields[name] = value.toString("utf8");
      continue;
    }

    if (file) {
      await reader.streamUntil(partEnd, async () => {});
      continue;
    }

    const original = safeName(filename);
    const stored = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${original}`;
    const absolutePath = path.join(uploadRoot, stored);
    const handle = await fs.open(absolutePath, "w");
    let size = 0;

    try {
      await reader.streamUntil(partEnd, async (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          throw new Error(
            `File is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit`
          );
        }
        await handle.write(chunk);
      });
    } catch (error) {
      await handle.close();
      await fs.rm(absolutePath, { force: true });
      throw error;
    }

    await handle.close();

    file = {
      fieldName: name,
      originalName: path.basename(filename),
      relativePath: path.posix.join("uploads", "apks", stored),
      absolutePath,
      size,
    };
  }

  return { fields, file };
}

export function resolveUploadPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

export async function deleteUpload(relativePath: string): Promise<void> {
  await fs.rm(resolveUploadPath(relativePath), { force: true });
}
