import { NextResponse } from "next/server";
import { getSession, sessionInfo, stopSession } from "@/lib/appium/session-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(sessionInfo(session));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const stopped = await stopSession(id);
  if (!stopped) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
