import { NextResponse } from "next/server";
import { readScreenshot } from "@/lib/engine/screenshot-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

const SAFE = /^[a-zA-Z0-9._-]+$/;

export async function GET(_request: Request, { params }: Params) {
  const { path } = await params;
  if (!path || path.length !== 2 || !path.every((segment) => SAFE.test(segment))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [runId, file] = path;
  const png = await readScreenshot(runId, file);
  if (!png) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
