"use client";

import { CirclePlay, CircleStop, Loader2, Play, Save, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppPicker } from "@/components/playground/AppPicker";
import { LocalFirstControl } from "@/components/playground/LocalFirstControl";
import { usePlayground } from "@/components/playground/context";

const DOT: Record<string, string> = {
  idle: "bg-neutral-400",
  starting: "bg-amber-500 animate-pulse",
  ready: "bg-emerald-500",
  stopping: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
};

export function SessionBar({ onSave }: { onSave: () => void }) {
  const { state, actions } = usePlayground();
  const session = state.session;
  const running = state.run.status === "running";
  const starting = session.status === "starting" || session.status === "stopping";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2">
      <AppPicker />

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${DOT[session.status]}`} />
        <span className="text-xs text-muted-foreground">
          {session.status === "ready" && session.info
            ? `${session.info.window.w}x${session.info.window.h}`
            : session.status}
        </span>
        {session.status === "ready" ? (
          <Button variant="outline" size="sm" onClick={() => void actions.stopSession()}>
            <CircleStop className="size-4" />
            Stop session
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={starting || !state.selectedAppId}
            onClick={() => void actions.startSession()}
          >
            {starting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CirclePlay className="size-4" />
            )}
            Start session
          </Button>
        )}
      </div>

      <Separator orientation="vertical" className="h-6" />

      <LocalFirstControl />

      <div className="ml-auto flex items-center gap-2">
        {state.currentTest ? (
          <Badge variant="outline" className="text-[11px]">
            {state.currentTest.name}
            {state.saved ? "" : " •"}
          </Badge>
        ) : null}

        <Button variant="outline" size="sm" onClick={onSave}>
          <Save className="size-4" />
          Save
        </Button>

        {running ? (
          <Button size="sm" variant="destructive" onClick={() => void actions.stopRun()}>
            <Square className="size-4" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={session.status !== "ready" || state.script.trim().length === 0}
            onClick={() => void actions.runScript()}
          >
            <Play className="size-4" />
            Run
          </Button>
        )}
      </div>

      {session.error ? (
        <div className="w-full rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {session.error}
        </div>
      ) : null}
    </div>
  );
}
