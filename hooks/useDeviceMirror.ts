"use client";

import { useEffect, useRef, useState } from "react";

export type MirrorState = {
  src: string | null;
  error: string | null;
  source: string | null;
};

export function useDeviceMirror(
  sessionId: string | null,
  intervalMs: number,
  enabled: boolean
): MirrorState {
  const [state, setState] = useState<MirrorState>({
    src: null,
    error: null,
    source: null,
  });
  const urlRef = useRef<string | null>(null);
  const etagRef = useRef<string | null>(null);
  const intervalRef = useRef(intervalMs);

  intervalRef.current = intervalMs;

  useEffect(() => {
    if (!sessionId || !enabled) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      etagRef.current = null;
      setState({ src: null, error: null, source: null });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = setTimeout(tick, delay);
    };

    async function tick() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule(intervalRef.current);
        return;
      }
      try {
        const response = await fetch(`/api/sessions/${sessionId}/screen`, {
          headers: etagRef.current ? { "If-None-Match": etagRef.current } : undefined,
          cache: "no-store",
        });

        if (response.status === 404) {
          if (!cancelled) {
            setState((prev) => ({ ...prev, error: "Session ended" }));
          }
          return;
        }

        if (response.status === 304) {
          schedule(intervalRef.current);
          return;
        }

        if (!response.ok) {
          const body = await response.text();
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error: body.slice(0, 200) || `Mirror failed (${response.status})`,
            }));
          }
          schedule(Math.max(intervalRef.current, 1500));
          return;
        }

        etagRef.current = response.headers.get("etag");
        const source = response.headers.get("x-frame-source");
        const blob = await response.blob();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        const previous = urlRef.current;
        urlRef.current = next;
        setState({ src: next, error: null, source });
        if (previous) URL.revokeObjectURL(previous);
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
      schedule(intervalRef.current);
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      etagRef.current = null;
    };
  }, [sessionId, enabled]);

  return state;
}
