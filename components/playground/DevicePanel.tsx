"use client";

import { Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDeviceMirror } from "@/hooks/useDeviceMirror";
import { usePlayground } from "@/components/playground/context";

export function DevicePanel() {
  const { state } = usePlayground();
  const session = state.session.info;
  const running = state.run.status === "running";
  const mirror = useDeviceMirror(
    session?.sessionId ?? null,
    running ? 1500 : 700,
    state.session.status === "ready"
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Smartphone className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium">Device</span>
        {mirror.source ? (
          <Badge variant="secondary" className="text-[10px]">
            {mirror.source}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-100 p-3 dark:bg-neutral-900">
        {mirror.src ? (
          <img
            src={mirror.src}
            alt="Device screen"
            className="max-h-full max-w-full rounded-lg border shadow-sm"
          />
        ) : (
          <div className="max-w-[220px] text-center text-xs text-muted-foreground">
            {state.session.status === "ready"
              ? (mirror.error ?? "Waiting for the first frame…")
              : "Start a session to mirror the emulator"}
          </div>
        )}
      </div>
    </div>
  );
}
