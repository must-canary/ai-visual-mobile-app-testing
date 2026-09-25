"use client";

import { useEffect, useRef } from "react";
import { RUN_EVENT_TYPES } from "@/lib/engine/event-types";
import type { RunEventEnvelope } from "@/models/types";
import type { Action } from "@/lib/playground/reducer";

export function useRunEvents(
  runId: string | null,
  active: boolean,
  lastSeq: number,
  dispatch: (action: Action) => void
): void {
  const seqRef = useRef(lastSeq);
  seqRef.current = lastSeq;

  useEffect(() => {
    if (!runId || !active) return;

    const source = new EventSource(
      `/api/runs/${runId}/events?after=${seqRef.current}`
    );
    let buffer: RunEventEnvelope[] = [];
    let frame: number | null = null;

    const flush = () => {
      frame = null;
      if (buffer.length === 0) return;
      const envelopes = buffer;
      buffer = [];
      dispatch({ type: "run/events", envelopes });
    };

    const queue = (event: MessageEvent<string>) => {
      try {
        buffer.push(JSON.parse(event.data) as RunEventEnvelope);
      } catch {
        return;
      }
      if (frame === null) frame = requestAnimationFrame(flush);
    };

    for (const type of RUN_EVENT_TYPES) {
      source.addEventListener(type, queue as EventListener);
    }

    source.onopen = () => dispatch({ type: "run/connection", connection: "open" });
    source.onerror = () => {
      flush();
      dispatch({ type: "run/connection", connection: "error" });
      source.close();
    };

    dispatch({ type: "run/connection", connection: "connecting" });

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      for (const type of RUN_EVENT_TYPES) {
        source.removeEventListener(type, queue as EventListener);
      }
      source.close();
    };
  }, [runId, active, dispatch]);
}
