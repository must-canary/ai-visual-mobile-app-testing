import Anthropic from "@anthropic-ai/sdk";
import type { ZodType, ZodTypeDef } from "zod";
import { env } from "@/lib/env";
import type { JsonSchema } from "@/lib/vision/schemas";

export type VisionUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estCostUsd: number;
};

function redactSecrets(message: string): string {
  const secrets = [
    process.env.GEMINI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter((value): value is string => Boolean(value));
  return secrets.reduce((safe, secret) => safe.split(secret).join("[REDACTED]"), message);
}

export class VisionError extends Error {
  constructor(message: string) {
    super(redactSecrets(message));
    this.name = "VisionError";
  }
}

const PRICES: Array<{ prefix: string; input: number; output: number }> = [
  { prefix: "claude-opus-5", input: 5, output: 25 },
  { prefix: "claude-fable-5", input: 5, output: 25 },
  { prefix: "claude-sonnet-5", input: 2, output: 10 },
  { prefix: "claude-haiku-4-5", input: 1, output: 5 },
  { prefix: "claude-3-5-haiku", input: 0.8, output: 4 },
];

function priceFor(model: string): { input: number; output: number } {
  return (
    PRICES.find((entry) => model.startsWith(entry.prefix)) ?? {
      input: 1,
      output: 5,
    }
  );
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): number {
  const price = priceFor(model);
  const perToken = (rate: number) => rate / 1_000_000;
  return (
    inputTokens * perToken(price.input) +
    outputTokens * perToken(price.output) +
    cacheReadTokens * perToken(price.input) * 0.1 +
    cacheWriteTokens * perToken(price.input) * 1.25
  );
}

type ClientGlobal = { client?: Anthropic };
const globalForVision = globalThis as unknown as { __vmtVision?: ClientGlobal };
const store: ClientGlobal = (globalForVision.__vmtVision ??= {});

export function visionConfigured(): boolean {
  return env.visionProvider === "gemini"
    ? Boolean(env.geminiApiKey)
    : Boolean(env.anthropicAuthToken ?? env.anthropicApiKey);
}

export function getVisionClient(): Anthropic {
  if (store.client) return store.client;
  const authToken = env.anthropicAuthToken;
  const apiKey = env.anthropicApiKey;
  if (!authToken && !apiKey) {
    throw new VisionError(
      "No Anthropic credentials. Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN for a gateway) in .env.local."
    );
  }
  const workspaceId = env.anthropicWorkspaceId;
  // Every credential and endpoint is passed explicitly. Left undefined, the SDK
  // falls back to its own ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN process.env
  // lookup, which silently redirects vision calls to whatever gateway happens to
  // be exported on the machine instead of what lib/env.ts resolved.
  store.client = new Anthropic({
    apiKey: authToken ? null : (apiKey ?? null),
    authToken: authToken ?? null,
    baseURL: env.anthropicBaseUrl ?? "https://api.anthropic.com",
    maxRetries: 1,
    defaultHeaders: workspaceId
      ? { "anthropic-workspace-id": workspaceId }
      : undefined,
  });
  return store.client;
}

type ApiContentBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
};

type NormalizedAnthropicResponse = {
  stopReason: string | null;
  content: ApiContentBlock[];
  usage: VisionUsage;
};

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403) {
      return `The vision provider rejected the credentials (HTTP ${error.status}). Check ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN.`;
    }
    return `Vision request failed (HTTP ${error.status}): ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/Unexpected token|not valid JSON|JSON at position|<!doctype/i.test(message)) {
    return `The vision endpoint returned a web page instead of an API response. ${
      env.anthropicBaseUrl
        ? `ANTHROPIC_BASE_URL is ${env.anthropicBaseUrl} — the token may be expired or the gateway may require a fresh login.`
        : "Check ANTHROPIC_BASE_URL."
    }`;
  }
  return redactSecrets(message);
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new VisionError("No JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function baseUrlHost(): string | null {
  const base = env.anthropicBaseUrl;
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

function looksLikeHtml(value: string): boolean {
  const head = value.slice(0, 200).trimStart().toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<?xml")
  );
}

/**
 * The SDK only returns a Message object when the endpoint answers with JSON. A
 * gateway that has expired its session answers 200 text/html (a sign-in page),
 * and the SDK hands that body back as a plain string. Describe what actually
 * arrived instead of failing with an opaque type complaint.
 */
function describeNonObjectResponse(raw: unknown): string {
  const host = baseUrlHost();
  const where = host
    ? ` ANTHROPIC_BASE_URL points at ${host}.`
    : " ANTHROPIC_BASE_URL is unset, so api.anthropic.com was used.";
  if (typeof raw === "string") {
    if (looksLikeHtml(raw)) {
      return `The vision endpoint returned an HTML page (${raw.length} bytes) instead of a JSON API response — the gateway redirected to a sign-in page, so the configured credentials are no longer accepted.${where} Point ANTHROPIC_BASE_URL at a working Anthropic-compatible endpoint (or unset it to use api.anthropic.com) and refresh the credentials.`;
    }
    return `The vision endpoint returned a plain-text body (${raw.length} bytes) instead of a JSON API response.${where}`;
  }
  return `The vision endpoint returned a ${
    raw === null ? "null" : typeof raw
  } response instead of a JSON object.${where}`;
}

function providerErrorMessage(response: Record<string, unknown>): string | null {
  if (typeof response.error === "string") return response.error;
  const error = record(response.error);
  if (!error) return null;
  const type = typeof error.type === "string" ? error.type : null;
  const message = typeof error.message === "string" ? error.message : null;
  if (!type && !message) return null;
  return [type, message].filter(Boolean).join(": ");
}

/** OpenAI Responses API: { output: [{ type, content: [...] } | { type: "function_call", name, arguments }] } */
function contentFromResponsesApi(response: Record<string, unknown>): ApiContentBlock[] {
  const blocks: ApiContentBlock[] = [];
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const node = record(item);
    if (!node) continue;
    if (node.type === "function_call" && typeof node.name === "string") {
      blocks.push({
        type: "tool_use",
        name: node.name,
        input: parseToolArguments(node.arguments),
      });
      continue;
    }
    const parts = Array.isArray(node.content) ? node.content : [];
    for (const rawPart of parts) {
      const part = record(rawPart);
      if (part && typeof part.text === "string") {
        blocks.push({ type: "text", text: part.text });
      }
    }
  }
  if (blocks.length === 0 && typeof response.output_text === "string") {
    blocks.push({ type: "text", text: response.output_text });
  }
  return blocks;
}

function normalizeAnthropicResponse(raw: unknown): NormalizedAnthropicResponse {
  const response = record(raw);
  if (!response) {
    throw new VisionError(describeNonObjectResponse(raw));
  }

  const providerError = providerErrorMessage(response);
  if (providerError) {
    throw new VisionError(`The vision provider returned an error: ${providerError}`);
  }

  let content: ApiContentBlock[] = [];
  if (Array.isArray(response.content)) {
    content = response.content
      .map(record)
      .filter((block): block is Record<string, unknown> => block !== null)
      .map((block) => ({
        type: typeof block.type === "string" ? block.type : "unknown",
        text: typeof block.text === "string" ? block.text : undefined,
        name: typeof block.name === "string" ? block.name : undefined,
        input: block.input,
      }));
  } else if (typeof response.content === "string") {
    content = [{ type: "text", text: response.content }];
  }

  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = record(choices[0]);
  const message = record(firstChoice?.message);
  if (content.length === 0 && message) {
    if (typeof message.content === "string") {
      content.push({ type: "text", text: message.content });
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        const part = record(item);
        if (!part) continue;
        if (typeof part.text === "string") {
          content.push({ type: "text", text: part.text });
        }
      }
    }
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const item of toolCalls) {
      const toolCall = record(item);
      const fn = record(toolCall?.function);
      if (!fn || typeof fn.name !== "string") continue;
      content.push({
        type: "tool_use",
        name: fn.name,
        input: parseToolArguments(fn.arguments),
      });
    }
  }

  if (content.length === 0) {
    content = contentFromResponsesApi(response);
  }

  if (content.length === 0) {
    const keys = Object.keys(response).slice(0, 12).join(", ");
    throw new VisionError(
      `The Anthropic-compatible vision endpoint returned no content or tool result (top-level keys: ${
        keys || "none"
      })`
    );
  }

  const usage = record(response.usage) ?? {};
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0);
  const cacheWriteTokens = Number(usage.cache_creation_input_tokens ?? 0);
  const stopReason =
    typeof response.stop_reason === "string"
      ? response.stop_reason
      : typeof firstChoice?.finish_reason === "string"
        ? firstChoice.finish_reason
        : null;

  return {
    stopReason,
    content,
    usage: {
      calls: 1,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      estCostUsd: 0,
    },
  };
}

export type VisionCall<T> = {
  schema: ZodType<T, ZodTypeDef, unknown>;
  jsonSchema: JsonSchema;
  toolName: string;
  toolDescription: string;
  system: string;
  imageBase64: string;
  text: string;
  signal?: AbortSignal;
};

export type VisionOutcome<T> = {
  value: T;
  usage: VisionUsage;
};

function geminiModelName(model: string): string {
  return model.replace(/^models\//, "").replace(/^gemini\//, "");
}

async function callGemini<T>(call: VisionCall<T>): Promise<VisionOutcome<T>> {
  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    throw new VisionError("No Gemini credentials. Set GEMINI_API_KEY in .env.local.");
  }

  const model = geminiModelName(env.visionModel);
  const baseUrl = env.geminiBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: call.system }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: call.imageBase64,
            },
          },
          { text: call.text },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseJsonSchema: call.jsonSchema,
    },
  });

  let response: Response | undefined;
  let payload:
    | (GeminiResponse & { error?: { message?: string } })
    | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: requestBody,
      signal: call.signal,
    });
    payload = (await response.json()) as GeminiResponse & {
      error?: { message?: string };
    };
    const retryable = response.status === 429 || response.status >= 500;
    if (response.ok || !retryable || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }

  if (!response || !payload) throw new VisionError("The Gemini vision provider returned no response");
  if (!response.ok) {
    throw new VisionError(
      redactSecrets(`Vision request failed (HTTP ${response.status}): ${
        payload.error?.message ?? response.statusText
      }`)
    );
  }

  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const reason =
      payload.promptFeedback?.blockReasonMessage ??
      payload.promptFeedback?.blockReason ??
      candidate?.finishReason ??
      "empty response";
    throw new VisionError(
      redactSecrets(`The Gemini vision provider returned no structured result: ${reason}`)
    );
  }

  const parsed = call.schema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new VisionError(
      `The model returned an unusable result: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`
    );
  }

  const inputTokens = payload.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;
  const cacheReadTokens = payload.usageMetadata?.cachedContentTokenCount ?? 0;
  return {
    value: parsed.data,
    usage: {
      calls: 1,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens: 0,
      estCostUsd: estimateCost(model, inputTokens, outputTokens, cacheReadTokens, 0),
    },
  };
}

export async function callVision<T>(call: VisionCall<T>): Promise<VisionOutcome<T>> {
  if (env.visionProvider === "gemini") return callGemini(call);

  const client = getVisionClient();
  const model = env.visionModel;

  const imageBlock = {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/png" as const,
      data: call.imageBase64,
    },
  };

  const buildParams = (useTools: boolean) => ({
    model,
    max_tokens: 1024,
    system: useTools
      ? [
          {
            type: "text" as const,
            text: call.system,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : `${call.system}\n\nReply with a single JSON object matching this schema and nothing else:\n${JSON.stringify(
          call.jsonSchema
        )}`,
    messages: [
      {
        role: "user" as const,
        content: [imageBlock, { type: "text" as const, text: call.text }],
      },
    ],
    ...(useTools
      ? {
          tools: [
            {
              name: call.toolName,
              description: call.toolDescription,
              input_schema: call.jsonSchema,
            },
          ],
          tool_choice: { type: "tool" as const, name: call.toolName },
        }
      : {}),
  });

  const attempts: Array<{ useTools: boolean }> = [
    { useTools: true },
    { useTools: true },
    { useTools: false },
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const rawResponse = await client.messages.create(
        buildParams(attempt.useTools) as never,
        { signal: call.signal }
      );
      const response = normalizeAnthropicResponse(rawResponse);

      if (response.stopReason === "refusal") {
        throw new VisionError("The model refused to answer for this screenshot");
      }

      const toolBlock = response.content.find(
        (block) => block.type === "tool_use" && block.name === call.toolName
      );
      const textBlock = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      const payload = toolBlock ? toolBlock.input : extractJson(textBlock);
      const parsed = call.schema.safeParse(payload);
      if (!parsed.success) {
        lastError = new VisionError(
          `The model returned an unusable result: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")} ${issue.message}`)
            .join("; ")}`
        );
        continue;
      }

      const inputTokens = response.usage.inputTokens;
      const outputTokens = response.usage.outputTokens;
      const cacheReadTokens = response.usage.cacheReadTokens;
      const cacheWriteTokens = response.usage.cacheWriteTokens;

      return {
        value: parsed.data,
        usage: {
          calls: 1,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          estCostUsd: estimateCost(
            model,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens
          ),
        },
      };
    } catch (error) {
      if (call.signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw new VisionError(describeError(lastError));
}
