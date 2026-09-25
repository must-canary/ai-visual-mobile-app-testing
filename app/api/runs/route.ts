import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runs } from "@/lib/mongodb";
import { getSession } from "@/lib/appium/session-manager";
import { parseScript } from "@/lib/dsl/parser";
import { executableSteps } from "@/lib/dsl/parser";
import { RunConflict, startRun } from "@/lib/engine/run-controller";
import { toRunDto } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const testId = url.searchParams.get("testId");
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const collection = await runs();
  const docs = await collection
    .find(testId ? { testId } : {})
    .sort({ startedAt: -1 })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20)
    .project({ events: 0 })
    .toArray();
  return NextResponse.json(
    docs.map((doc) =>
      toRunDto(doc as unknown as Parameters<typeof toRunDto>[0], 0)
    )
  );
}

export async function POST(request: Request) {
  let body: {
    sessionId?: string;
    script?: string;
    testId?: string | null;
    localFirst?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found. Start a session first." },
      { status: 404 }
    );
  }

  const script = body.script ?? "";
  const parsed = parseScript(script);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        error: `Script has ${parsed.errors.length} unrecognised line(s)`,
        errors: parsed.errors,
      },
      { status: 400 }
    );
  }

  const steps = executableSteps(parsed.steps);
  if (steps.length === 0) {
    return NextResponse.json({ error: "Nothing to run" }, { status: 400 });
  }

  try {
    const runId = await startRun({
      session,
      script,
      steps,
      testId: body.testId ?? null,
      mode: "full",
      localFirst: body.localFirst ?? env.localFirstEnabled,
    });
    return NextResponse.json({ runId }, { status: 202 });
  } catch (error) {
    if (error instanceof RunConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
