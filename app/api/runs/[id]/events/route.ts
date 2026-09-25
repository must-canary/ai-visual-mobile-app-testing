import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { runs } from "@/lib/mongodb";
import { formatSse, getRun } from "@/lib/engine/events";
import type { RunEventEnvelope } from "@/models/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function afterFrom(request: Request): number {
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) {
    const parsed = Number(lastEventId);
    if (Number.isFinite(parsed)) return parsed;
  }
  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? 0);
  return Number.isFinite(after) ? after : 0;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const after = afterFrom(request);
  const active = getRun(id);
  const encoder = new TextEncoder();

  if (!active) {
    const collection = await runs();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const replay = (doc.events ?? []).filter((event) => event.seq > after);
    const body = [": connected\n\n", ...replay.map(formatSse)].join("");
    return new Response(encoder.encode(body), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send(": connected\n\n");
      for (const envelope of active.bus.since(after)) {
        send(formatSse(envelope));
      }

      const onEvent = (envelope: RunEventEnvelope) => {
        send(formatSse(envelope));
        if (envelope.type === "run:end") {
          cleanup();
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      };

      const heartbeat = setInterval(() => send(": ping\n\n"), 15000);
      heartbeat.unref?.();

      const cleanup = () => {
        clearInterval(heartbeat);
        active.bus.off("event", onEvent);
        request.signal.removeEventListener("abort", onAbort);
      };

      function onAbort() {
        cleanup();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }

      active.bus.on("event", onEvent);
      request.signal.addEventListener("abort", onAbort);

      if (active.finished) {
        cleanup();
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
