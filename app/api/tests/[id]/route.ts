import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { runs, tests } from "@/lib/mongodb";
import { parseScript } from "@/lib/dsl/parser";
import { removeRunScreenshots } from "@/lib/engine/screenshot-store";
import { toTestDto } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
  }
  const collection = await tests();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "Test not found" }, { status: 404 });
  return NextResponse.json(toTestDto(doc));
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
  }

  let body: { name?: string; appId?: string; script?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const collection = await tests();
  const existing = await collection.findOne({ _id: new ObjectId(id) });
  if (!existing) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const script = body.script ?? existing.script;
  const parsed = parseScript(script);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: "Script has unrecognised lines", errors: parsed.errors },
      { status: 400 }
    );
  }

  const update = {
    name: (body.name ?? existing.name).trim(),
    appId: body.appId ?? existing.appId,
    script,
    updatedAt: new Date(),
  };

  await collection.updateOne({ _id: new ObjectId(id) }, { $set: update });
  return NextResponse.json(toTestDto({ ...existing, ...update }));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
  }

  const collection = await tests();
  const existing = await collection.findOne({ _id: new ObjectId(id) });
  if (!existing) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const runsCollection = await runs();
  const runDocs = await runsCollection
    .find({ testId: id })
    .project({ _id: 1 })
    .toArray();

  for (const run of runDocs) {
    await removeRunScreenshots(String(run._id)).catch(() => undefined);
  }
  await runsCollection.deleteMany({ testId: id });
  await collection.deleteOne({ _id: new ObjectId(id) });

  return NextResponse.json({ ok: true, deletedRuns: runDocs.length });
}
