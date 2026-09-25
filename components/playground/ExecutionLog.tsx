"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { RunSummary } from "@/components/playground/RunSummary";
import { StepCard } from "@/components/playground/StepCard";
import { usePlayground } from "@/components/playground/context";

export function ExecutionLog() {
  const { state } = usePlayground();
  const run = state.run;
  const steps = run.order.map((index) => run.steps[index]).filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium">Execution</span>
        {run.runId ? (
          <code className="font-mono text-[10px] text-muted-foreground">
            {run.runId.slice(-8)}
          </code>
        ) : null}
      </div>

      <RunSummary run={run} />

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Run a script or a single line to see every stage here.
            </p>
          ) : (
            steps.map((step) => <StepCard key={step.index} step={step} />)
          )}

          {run.error ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {run.error}
            </div>
          ) : null}

          {run.logs.length > 0 ? (
            <details className="rounded-md border p-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Engine log ({run.logs.length})
              </summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
                {run.logs.map((log, index) => (
                  <li key={index}>
                    [{log.level}] {log.msg}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
