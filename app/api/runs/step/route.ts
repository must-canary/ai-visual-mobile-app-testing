import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/lib/appium/session-manager";
import { parseLine } from "@/lib/dsl/parser";
import { RunConflict, startRun } from "@/lib/engine/run-controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    sessionId?: string;
    line?: string;
    lineNo?: number;
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

  const line = (body.line ?? "").trim();
  const lineNo = body.lineNo ?? 0;
  const step = parseLine(line, lineNo);
  if (!step) {
    return NextResponse.json(
      {
        error: "That line could not be parsed",
        errors: [{ lineNo, raw: line, message: "Unknown step" }],
      },
      { status: 400 }
    );
  }
  if (step.kind === "comment") {
    return NextResponse.json({ error: "Comments cannot be run" }, { status: 400 });
  }

  try {
    const runId = await startRun({
      session,
      script: line,
      steps: [{ ...step, lineNo }],
      testId: null,
      mode: "step",
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
