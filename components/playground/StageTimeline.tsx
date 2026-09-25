"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StageName, Stages } from "@/models/types";

const ORDER: StageName[] = ["capture", "classify", "locate", "act", "verify"];

const STAGE_CLASS: Record<string, string> = {
  pending: "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500",
  running: "bg-sky-100 text-sky-700 animate-pulse dark:bg-sky-950 dark:text-sky-300",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  fail: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  skip: "bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600",
};

export function StageTimeline({ stages }: { stages: Stages }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ORDER.map((name) => {
        const stage = stages[name];
        return (
          <Tooltip key={name}>
            <TooltipTrigger
              render={
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${STAGE_CLASS[stage.status]}`}
                >
                  {name}
                  {stage.ms > 0 ? ` ${stage.ms}ms` : ""}
                </span>
              }
            />
            <TooltipContent className="max-w-[320px]">
              {stage.detail || stage.status}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
