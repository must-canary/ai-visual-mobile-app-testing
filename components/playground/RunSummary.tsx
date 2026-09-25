"use client";

import { Badge } from "@/components/ui/badge";
import type { RunState } from "@/lib/playground/types";

function count(run: RunState, status: string): number {
  return Object.values(run.steps).filter((step) => step.status === status).length;
}

export function RunSummary({ run }: { run: RunState }) {
  if (run.status === "idle") return null;
  const usage = run.usage;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 text-xs backdrop-blur">
      <Badge
        variant={
          run.status === "passed"
            ? "default"
            : run.status === "failed"
              ? "destructive"
              : "secondary"
        }
      >
        {run.status}
      </Badge>
      <span className="text-emerald-600">{count(run, "passed")} passed</span>
      <span className="text-red-600">{count(run, "failed")} failed</span>
      <span className="text-amber-600">{count(run, "healed")} healed</span>
      <span className="text-muted-foreground">{count(run, "skipped")} skipped</span>
      {run.durationMs !== null ? (
        <span className="text-muted-foreground">
          {(run.durationMs / 1000).toFixed(1)}s
        </span>
      ) : null}
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {usage.calls} vision · {usage.localHits} local ·{" "}
        {usage.inputTokens + usage.outputTokens} tok · ${usage.estCostUsd.toFixed(4)}
      </span>
      {run.connection === "error" ? (
        <Badge variant="outline" className="text-[10px]">
          stream lost
        </Badge>
      ) : null}
    </div>
  );
}
