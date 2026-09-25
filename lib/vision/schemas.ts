import { z } from "zod";

export const LocateResultSchema = z.object({
  found: z.boolean(),
  x: z.number().min(0).max(1000).nullable(),
  y: z.number().min(0).max(1000).nullable(),
  matched_text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  candidates: z.preprocess(
    (value) => value ?? [],
    z.array(
      z.object({
        x: z.number().min(0).max(1000),
        y: z.number().min(0).max(1000),
        label: z.string(),
      })
    )
  ),
  reason: z.string(),
});

export const ValidateResultSchema = z.object({
  result: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  reason: z.string(),
});

export type LocateResult = z.infer<typeof LocateResultSchema>;
export type ValidateResult = z.infer<typeof ValidateResultSchema>;

export type JsonSchema = Record<string, unknown>;

export const LOCATE_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "True only when exactly one element matches" },
    x: { type: ["number", "null"], minimum: 0, maximum: 1000, description: "Horizontal coordinate normalized from 0 (left) to 1000 (right)" },
    y: { type: ["number", "null"], minimum: 0, maximum: 1000, description: "Vertical coordinate normalized from 0 (top) to 1000 (bottom)" },
    matched_text: { type: ["string", "null"], description: "The visible label that was matched" },
    confidence: { type: "number", description: "0 to 1" },
    candidates: {
      type: "array",
      description: "Every equally plausible match when the target is ambiguous",
      items: {
        type: "object",
        properties: {
          x: { type: "number", minimum: 0, maximum: 1000 },
          y: { type: "number", minimum: 0, maximum: 1000 },
          label: { type: "string" },
        },
        required: ["x", "y", "label"],
      },
    },
    reason: { type: "string" },
  },
  required: ["found", "x", "y", "matched_text", "confidence", "candidates", "reason"],
};

export const VALIDATE_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    result: { type: "boolean" },
    confidence: { type: "number", description: "0 to 1" },
    evidence: { type: "string", description: "The visible text or element that proves the answer" },
    reason: { type: "string" },
  },
  required: ["result", "confidence", "evidence", "reason"],
};
