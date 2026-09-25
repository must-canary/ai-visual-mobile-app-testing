import { NextResponse } from "next/server";
import { cacheStats, clearCache } from "@/lib/engine/locate-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId") ?? undefined;
  return NextResponse.json(await cacheStats(appId));
}

export async function DELETE(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId") ?? undefined;
  const deleted = await clearCache(appId);
  return NextResponse.json({ ok: true, deleted, ...(await cacheStats(appId)) });
}
