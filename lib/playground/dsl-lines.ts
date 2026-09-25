import { parseScript } from "@/lib/dsl/parser";
import type { StepResult, StepStatus } from "@/models/types";
import type { ParseIssue } from "@/lib/playground/types";

export function scriptLines(script: string): string[] {
  return script.replace(/\r\n/g, "\n").split("\n");
}

export function parseIssuesByLine(script: string): Map<number, ParseIssue> {
  const map = new Map<number, ParseIssue>();
  for (const error of parseScript(script).errors) {
    map.set(error.lineNo, error);
  }
  return map;
}

export function statusByLine(
  steps: Record<number, StepResult>
): Map<number, StepStatus> {
  const map = new Map<number, StepStatus>();
  for (const step of Object.values(steps)) {
    map.set(step.lineNo, step.status);
  }
  return map;
}

export function isRunnable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("#");
}
