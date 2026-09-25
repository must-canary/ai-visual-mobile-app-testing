import { NextResponse } from "next/server";
import { getRun } from "@/lib/engine/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const run = getRun(id);
  if (!run || run.finished) {
    return NextResponse.json({ error: "Run is not active" }, { status: 409 });
  }
  run.abort.abort();
  return NextResponse.json({ ok: true });
}
