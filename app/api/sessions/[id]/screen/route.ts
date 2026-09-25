import { NextResponse } from "next/server";
import { getFrame, getSession } from "@/lib/appium/session-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === `"${session.frameSeq}"`) {
    const cached = session.lastFrame;
    const fresh = cached && Date.now() - cached.at < 400;
    if (session.activeRunId || fresh) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: `"${session.frameSeq}"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  try {
    const frame = await getFrame(session);
    if (ifNoneMatch === `"${frame.seq}"`) {
      return new Response(null, {
        status: 304,
        headers: { ETag: `"${frame.seq}"`, "Cache-Control": "no-store" },
      });
    }
    return new Response(new Uint8Array(frame.jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(frame.jpeg.length),
        ETag: `"${frame.seq}"`,
        "X-Frame-Source": frame.source,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
