import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import fs from "node:fs";
import { apps } from "@/lib/mongodb";
import { resolveUploadPath } from "@/lib/apk/upload";
import {
  SessionError,
  listSessions,
  sessionInfo,
  startSession,
  type ResetMode,
} from "@/lib/appium/session-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listSessions().map(sessionInfo));
}

export async function POST(request: Request) {
  let body: { appId?: string; reset?: ResetMode };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const appId = body.appId;
  if (!appId || !ObjectId.isValid(appId)) {
    return NextResponse.json({ error: "A valid appId is required" }, { status: 400 });
  }

  const collection = await apps();
  const app = await collection.findOne({ _id: new ObjectId(appId) });
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  const absolutePath = resolveUploadPath(app.filePath);
  if (!fs.existsSync(absolutePath)) {
    return NextResponse.json(
      { error: `The uploaded APK is missing at ${app.filePath}` },
      { status: 400 }
    );
  }

  try {
    const session = await startSession({
      appId,
      apkAbsolutePath: absolutePath,
      packageName: app.packageName,
      activity: app.activity,
      reset: body.reset ?? "none",
    });
    return NextResponse.json(sessionInfo(session), { status: 201 });
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
