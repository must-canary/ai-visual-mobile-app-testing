import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { runs } from "@/lib/mongodb";
import { getRun } from "@/lib/engine/events";
import { toRunDto } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }
  const collection = await runs();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const active = getRun(id);
  const lastSeq = active
    ? active.bus.lastSeq
    : (doc.events?.[doc.events.length - 1]?.seq ?? 0);

  return NextResponse.json(toRunDto(doc, lastSeq));
}
