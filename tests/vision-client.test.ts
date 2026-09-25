import { afterEach, describe, expect, it, vi } from "vitest";

const anthropicCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class Anthropic {
    static APIError = APIError;
    messages = { create: anthropicCreateMock };
  }
  return { default: Anthropic };
});

import { callVision } from "@/lib/vision/client";
import { LOCATE_JSON_SCHEMA, LocateResultSchema } from "@/lib/vision/schemas";

const expectedLocate = {
  found: true,
  x: 120,
  y: 480,
  matched_text: "Receive",
  confidence: 0.98,
  candidates: [],
  reason: "Exact visible text match",
};

const visionCall = {
  schema: LocateResultSchema,
  jsonSchema: LOCATE_JSON_SCHEMA,
  toolName: "report_location",
  toolDescription: "Locate an element",
  system: "Locate the target",
  imageBase64: "aW1hZ2U=",
  text: "Target: Receive",
};

function geminiResponse(): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify(expectedLocate) }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function anthropicResponse() {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "report_location", input: expectedLocate }],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

describe("configurable vision client", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("uses Gemini and parses its structured JSON response", async () => {
    process.env.VISION_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.VISION_MODEL = "gemini-2.5-flash";
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await callVision(visionCall);

    expect(result.value).toEqual(expectedLocate);
    expect(result.usage.calls).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(anthropicCreateMock).not.toHaveBeenCalled();
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toContain("gemini-2.5-flash:generateContent");
    expect(request[1]?.headers).toMatchObject({ "x-goog-api-key": "gemini-test-key" });
  });

  it("uses Anthropic and returns the same LocateResult structure", async () => {
    process.env.VISION_PROVIDER = "anthropic";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.VISION_MODEL = "claude-sonnet-4-5-20250929";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    anthropicCreateMock.mockResolvedValue(anthropicResponse());

    const result = await callVision(visionCall);

    expect(result.value).toEqual(expectedLocate);
    expect(Object.keys(result.value)).toEqual(Object.keys(expectedLocate));
    expect(result.usage.calls).toBe(1);
    expect(anthropicCreateMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    const [params] = anthropicCreateMock.mock.calls[0];
    expect(params.model).toBe("claude-sonnet-4-5-20250929");
    expect(params.messages[0].content[0].source.data).toBe(visionCall.imageBase64);
  });

  it("defaults a missing Anthropic locator candidates array", async () => {
    process.env.VISION_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.VISION_MODEL = "claude-sonnet-4-5-20250929";
    const { candidates: _candidates, ...withoutCandidates } = expectedLocate;
    anthropicCreateMock.mockResolvedValue({
      ...anthropicResponse(),
      content: [{ type: "tool_use", name: "report_location", input: withoutCandidates }],
    });

    const result = await callVision(visionCall);

    expect(result.value.candidates).toEqual([]);
  });

  it("normalizes an Anthropic-compatible OpenAI tool response", async () => {
    process.env.VISION_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.VISION_MODEL = "claude-sonnet-4-5-20250929";
    anthropicCreateMock.mockResolvedValue({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: null,
            tool_calls: [
              {
                function: {
                  name: "report_location",
                  arguments: JSON.stringify(expectedLocate),
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const result = await callVision(visionCall);

    expect(result.value).toEqual(expectedLocate);
    expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it("returns a controlled vision error when provider content is absent", async () => {
    process.env.VISION_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.VISION_MODEL = "claude-sonnet-4-5-20250929";
    anthropicCreateMock.mockResolvedValue({ usage: {} });

    await expect(callVision(visionCall)).rejects.toThrow(
      "Anthropic-compatible vision endpoint returned no content or tool result"
    );
  });

  it("selects the provider only from VISION_PROVIDER when both keys exist", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse());
    vi.stubGlobal("fetch", fetchMock);
    anthropicCreateMock.mockResolvedValue(anthropicResponse());

    process.env.VISION_PROVIDER = "gemini";
    process.env.VISION_MODEL = "gemini-2.5-flash";
    await callVision(visionCall);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(anthropicCreateMock).not.toHaveBeenCalled();

    process.env.VISION_PROVIDER = "anthropic";
    process.env.VISION_MODEL = "claude-sonnet-4-5-20250929";
    await callVision(visionCall);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(anthropicCreateMock).toHaveBeenCalledOnce();
  });

  it("retries a temporary Gemini service error", async () => {
    process.env.VISION_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.VISION_MODEL = "gemini-2.5-flash";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "High demand" } }), { status: 503 })
      )
      .mockResolvedValueOnce(geminiResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await callVision(visionCall);

    expect(result.value).toEqual(expectedLocate);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redacts configured secrets from provider error messages", async () => {
    process.env.VISION_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "do-not-leak-this-key";
    process.env.VISION_MODEL = "gemini-2.5-flash";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Rejected do-not-leak-this-key" } }),
          { status: 401 }
        )
      )
    );

    await expect(callVision(visionCall)).rejects.toThrow("Rejected [REDACTED]");
  });
});

describe("Anthropic-compatible response normalization", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  function useAnthropic() {
    process.env.VISION_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    process.env.VISION_MODEL = "claude-haiku-4-5-20251001";
  }

  // The live gateway answered 200 text/html with a sign-in page, so the SDK
  // resolved with the raw HTML string instead of a Message object.
  it("explains an HTML sign-in page returned as a plain string", async () => {
    useAnthropic();
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example.com";
    const html = '<!doctype html><html lang="en"><head><title>Sign in</title></head></html>';
    anthropicCreateMock.mockResolvedValue(html);

    const error = await callVision(visionCall).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("VisionError");
    expect((error as Error).message).toContain("HTML page");
    expect((error as Error).message).toContain("sign-in page");
    expect((error as Error).message).toContain("gateway.example.com");
    expect((error as Error).message).not.toContain("Cannot read properties");
  });

  it("reports a non-HTML plain-text body without throwing a TypeError", async () => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue("upstream connect error");

    const error = await callVision(visionCall).catch((e: unknown) => e);

    expect((error as Error).name).toBe("VisionError");
    expect((error as Error).message).toContain("plain-text body");
    expect(error).not.toBeInstanceOf(TypeError);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("turns a %s response into a controlled VisionError", async (_label, value) => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue(value);

    const error = await callVision(visionCall).catch((e: unknown) => e);

    expect((error as Error).name).toBe("VisionError");
    expect((error as Error).message).toContain("instead of a JSON object");
    expect((error as Error).message).not.toContain("Cannot read properties");
  });

  it("surfaces a provider error envelope as a descriptive VisionError", async () => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue({
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });

    const error = await callVision(visionCall).catch((e: unknown) => e);

    expect((error as Error).name).toBe("VisionError");
    expect((error as Error).message).toContain("authentication_error");
    expect((error as Error).message).toContain("invalid x-api-key");
  });

  it("normalizes an OpenAI Responses-format tool call", async () => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue({
      output: [
        {
          type: "function_call",
          name: "report_location",
          arguments: JSON.stringify(expectedLocate),
        },
      ],
      usage: { input_tokens: 12, output_tokens: 7 },
    });

    const result = await callVision(visionCall);

    expect(result.value).toEqual(expectedLocate);
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 7 });
  });

  it("normalizes OpenAI Responses-format output text", async () => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(expectedLocate) }],
        },
      ],
    });

    const result = await callVision(visionCall);

    expect(result.value).toEqual(expectedLocate);
  });

  it("names the observed top-level keys when no content is present", async () => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue({ id: "msg_1", model: "x", usage: {} });

    const error = await callVision(visionCall).catch((e: unknown) => e);

    expect((error as Error).message).toContain("no content or tool result");
    expect((error as Error).message).toContain("id, model, usage");
  });

  it("does not throw a TypeError when content blocks are malformed", async () => {
    useAnthropic();
    anthropicCreateMock.mockResolvedValue({
      content: [null, "text", { type: "tool_use", name: "report_location" }],
      usage: {},
    });

    const error = await callVision(visionCall).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TypeError);
    expect((error as Error).name).toBe("VisionError");
  });
});
