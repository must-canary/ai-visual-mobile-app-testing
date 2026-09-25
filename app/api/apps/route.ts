import { NextResponse } from "next/server";
import { apps } from "@/lib/mongodb";
import { readBadging } from "@/lib/apk/badging";
import { deleteUpload, receiveUpload } from "@/lib/apk/upload";
import { toAppDto, type AppDoc } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const collection = await apps();
  const docs = await collection.find({}).sort({ uploadedAt: -1 }).toArray();
  return NextResponse.json(docs.map(toAppDto));
}

export async function POST(request: Request) {
  let stored: Awaited<ReturnType<typeof receiveUpload>>["file"] = null;
  try {
    const upload = await receiveUpload(request);
    stored = upload.file;
    if (!stored) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }
    if (!stored.originalName.toLowerCase().endsWith(".apk")) {
      await deleteUpload(stored.relativePath);
      return NextResponse.json({ error: "Only .apk files are supported" }, { status: 400 });
    }

    const badging = await readBadging(stored.absolutePath);

    const doc: AppDoc = {
      name: badging.label,
      originalName: stored.originalName,
      filePath: stored.relativePath,
      size: stored.size,
      packageName: badging.packageName,
      activity: badging.activity,
      versionName: badging.versionName,
      uploadedAt: new Date(),
    };

    const collection = await apps();
    const inserted = await collection.insertOne(doc);
    return NextResponse.json(toAppDto({ ...doc, _id: inserted.insertedId }), {
      status: 201,
    });
  } catch (error) {
    if (stored) await deleteUpload(stored.relativePath).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
