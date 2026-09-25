"use client";

import { Badge } from "@/components/ui/badge";
import { StageTimeline } from "@/components/playground/StageTimeline";
import { ScreenshotPair } from "@/components/playground/ScreenshotPair";
import type { StepResult } from "@/models/types";

const STATUS_PILL: Record<string, string> = {
  passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  healed: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  skipped: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400",
  running: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  pending: "bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-500",
};

export function StepCard({ step }: { step: StepResult }) {
  const locate = step.locate;

  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {String(step.index + 1).padStart(2, "0")}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {step.kind}
        </Badge>
        <code className="flex-1 break-words font-mono text-xs">{step.raw}</code>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_PILL[step.status]}`}
        >
          {step.status}
        </span>
        {step.latencyMs > 0 ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {step.latencyMs}ms
          </span>
        ) : null}
      </div>

      <div className="mt-2">
        <StageTimeline stages={step.stages} />
      </div>

      {locate ? (
        <div className="mt-2 text-xs">
          {locate.found ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">resolved</span>
              <code className="font-mono">{locate.matchedText ?? "—"}</code>
              <span className="text-muted-foreground">
                {Math.round(locate.confidence * 100)}% · device {locate.deviceX},
                {locate.deviceY}
              </span>
              {locate.source === "local" ? (
                <Badge variant="secondary" className="text-[10px]">
                  local history
                </Badge>
              ) : null}
            </div>
          ) : (
            <div className="text-muted-foreground">{locate.reason}</div>
          )}

          {locate.candidates.length > 1 ? (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-red-600 dark:text-red-400">
              {locate.candidates.map((candidate, index) => (
                <li key={index}>
                  {candidate.label || "unlabelled"} at ({Math.round(candidate.x)},{" "}
                  {Math.round(candidate.y)})
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {step.verify && step.verify.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {step.verify.map((attempt) => (
            <li key={attempt.attempt} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground">try {attempt.attempt}</span>
              <span className={attempt.result ? "text-emerald-600" : "text-red-600"}>
                {attempt.result ? "true" : "false"}
              </span>
              <span className="text-muted-foreground">{attempt.evidence}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {step.error ? (
        <div className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {step.error}
        </div>
      ) : null}

      <div className="mt-2">
        <ScreenshotPair
          beforeUrl={step.beforeUrl}
          afterUrl={step.afterUrl}
          locate={locate}
        />
      </div>
    </div>
  );
}
