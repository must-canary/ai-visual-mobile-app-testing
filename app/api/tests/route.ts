import { NextResponse } from "next/server";
import { tests } from "@/lib/mongodb";
import { parseScript } from "@/lib/dsl/parser";
import { toTestDto, type TestDoc } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const collection = await tests();
  const docs = await collection.find({}).sort({ updatedAt: -1 }).toArray();
  return NextResponse.json(docs.map(toTestDto));
}

export async function POST(request: Request) {
  let body: { name?: string; appId?: string; script?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (!body.appId) return NextResponse.json({ error: "appId is required" }, { status: 400 });

  const script = body.script ?? "";
  const parsed = parseScript(script);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: "Script has unrecognised lines", errors: parsed.errors },
      { status: 400 }
    );
  }

  const now = new Date();
  const doc: TestDoc = {
    name,
    appId: body.appId,
    script,
    createdAt: now,
    updatedAt: now,
    lastRunId: null,
  };

  const collection = await tests();
  const inserted = await collection.insertOne(doc);
  return NextResponse.json(toTestDto({ ...doc, _id: inserted.insertedId }), {
    status: 201,
  });
}
