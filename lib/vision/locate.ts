import { callVision, type VisionOutcome, type VisionUsage } from "@/lib/vision/client";
import {
  LOCATE_SYSTEM,
  VALIDATE_SYSTEM,
  locateUserText,
  validateUserText,
} from "@/lib/vision/prompts";
import {
  LOCATE_JSON_SCHEMA,
  LocateResultSchema,
  VALIDATE_JSON_SCHEMA,
  ValidateResultSchema,
  type LocateResult,
  type ValidateResult,
} from "@/lib/vision/schemas";

export const MIN_LOCATE_CONFIDENCE = 0.6;

export type LocateInput = {
  imageBase64: string;
  sentW: number;
  sentH: number;
  target: string;
  signal?: AbortSignal;
};

export async function locate(
  input: LocateInput
): Promise<VisionOutcome<LocateResult>> {
  return callVision({
    schema: LocateResultSchema,
    jsonSchema: LOCATE_JSON_SCHEMA,
    toolName: "report_location",
    toolDescription:
      "Report where the described element is in the screenshot, or why it could not be resolved.",
    system: LOCATE_SYSTEM,
    imageBase64: input.imageBase64,
    text: locateUserText(input.sentW, input.sentH, input.target),
    signal: input.signal,
  });
}

export type ValidateInput = {
  imageBase64: string;
  sentW: number;
  sentH: number;
  condition: string;
  signal?: AbortSignal;
};

export async function validate(
  input: ValidateInput
): Promise<VisionOutcome<ValidateResult>> {
  return callVision({
    schema: ValidateResultSchema,
    jsonSchema: VALIDATE_JSON_SCHEMA,
    toolName: "report_validation",
    toolDescription:
      "Report whether the condition holds for what is visible in the screenshot.",
    system: VALIDATE_SYSTEM,
    imageBase64: input.imageBase64,
    text: validateUserText(input.sentW, input.sentH, input.condition),
    signal: input.signal,
  });
}

export function explainLocateFailure(
  target: string,
  result: LocateResult
): string {
  if (result.candidates.length > 1) {
    const list = result.candidates
      .map((c, i) => `${i + 1}. ${c.label || "unlabelled"} at (${Math.round(c.x)}, ${Math.round(c.y)})`)
      .join("; ");
    return `"${target}" is ambiguous — ${result.candidates.length} matches: ${list}. Describe it more precisely.`;
  }
  if (!result.found) {
    return `Could not find "${target}" on this screen. ${result.reason}`.trim();
  }
  if (result.confidence < MIN_LOCATE_CONFIDENCE) {
    return `Found "${result.matched_text ?? target}" but confidence was only ${result.confidence.toFixed(
      2
    )} (minimum ${MIN_LOCATE_CONFIDENCE}). ${result.reason}`.trim();
  }
  return result.reason;
}

export function addUsage(target: VisionUsage, delta: VisionUsage): void {
  target.calls += delta.calls;
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.cacheReadTokens += delta.cacheReadTokens;
  target.cacheWriteTokens += delta.cacheWriteTokens;
  target.estCostUsd += delta.estCostUsd;
}
