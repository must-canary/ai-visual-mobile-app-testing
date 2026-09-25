import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { apps } from "@/lib/mongodb";
import { deleteUpload } from "@/lib/apk/upload";
import { listSessions } from "@/lib/appium/session-manager";
import { toAppDto } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid app id" }, { status: 400 });
  }
  const collection = await apps();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "App not found" }, { status: 404 });
  return NextResponse.json(toAppDto(doc));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid app id" }, { status: 400 });
  }

  if (listSessions().some((session) => session.appId === id)) {
    return NextResponse.json(
      { error: "A session is using this app. Stop the session first." },
      { status: 409 }
    );
  }

  const collection = await apps();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "App not found" }, { status: 404 });

  await deleteUpload(doc.filePath).catch(() => undefined);
  await collection.deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ ok: true });
}
