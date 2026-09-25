import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLocate: vi.fn(),
  recordHit: vi.fn(),
  locate: vi.fn(),
}));

vi.mock("@/lib/engine/locate-cache", () => ({
  PATCH_SIZE: 96,
  findLocate: mocks.findLocate,
  findValidate: vi.fn(),
  recordHit: mocks.recordHit,
  recordMiss: vi.fn(),
  saveLocate: vi.fn(),
  saveValidate: vi.fn(),
}));

vi.mock("@/lib/vision/locate", () => ({
  MIN_LOCATE_CONFIDENCE: 0.6,
  locate: mocks.locate,
  validate: vi.fn(),
  addUsage: vi.fn(),
  explainLocateFailure: vi.fn(),
}));

vi.mock("@/lib/vision/image", () => ({
  prepareImage: vi.fn().mockResolvedValue({
    buffer: Buffer.from("prepared"),
    base64: "cHJlcGFyZWQ=",
    sentW: 100,
    sentH: 200,
  }),
}));

vi.mock("@/lib/vision/phash", () => ({
  screenHash: vi.fn().mockResolvedValue("screen-hash"),
  patchHash: vi.fn(),
  hamming: vi.fn(),
}));

import { resolveTarget, type StepContext } from "@/lib/engine/step-executor";
import { EMPTY_USAGE } from "@/models/types";

describe("Local First provider bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLocate.mockResolvedValue({
      entry: {
        _id: "cache-entry",
        x: 25,
        y: 50,
        matchedText: "Receive",
        confidence: 0.99,
      },
      screenDistance: 0,
    });
  });

  it.each(["gemini", "anthropic"] as const)(
    "skips the %s provider on a Local First HIT",
    async (provider) => {
      process.env.VISION_PROVIDER = provider;
      const ctx = {
        runId: "run-id",
        appId: "app-id",
        localFirst: true,
        signal: new AbortController().signal,
        usage: { ...EMPTY_USAGE },
        bus: { publish: vi.fn() },
        session: {
          shotSize: { w: 100, h: 200 },
          window: { w: 100, h: 200 },
        },
      } as unknown as StepContext;

      const result = await resolveTarget(ctx, 0, "Receive", Buffer.from("screen"), true);

      expect(result.fromCache).toBe(true);
      expect(result.info.source).toBe("local");
      expect(result.info.x).toBe(25);
      expect(result.info.y).toBe(50);
      expect(ctx.usage.localHits).toBe(1);
      expect(mocks.locate).not.toHaveBeenCalled();
      expect(mocks.recordHit).toHaveBeenCalledOnce();
    }
  );

  it("converts malformed provider output into a controlled StepFailure", async () => {
    mocks.findLocate.mockResolvedValue(null);
    mocks.locate.mockRejectedValue(new Error("provider response had no content"));
    const ctx = {
      runId: "run-id",
      appId: "app-id",
      localFirst: false,
      signal: new AbortController().signal,
      usage: { ...EMPTY_USAGE },
      bus: { publish: vi.fn() },
      session: {
        shotSize: { w: 100, h: 200 },
        window: { w: 100, h: 200 },
      },
    } as unknown as StepContext;

    await expect(
      resolveTarget(ctx, 0, "the PIN input field", Buffer.from("screen"), true)
    ).rejects.toThrow(
      'Visual locator could not resolve "the PIN input field": provider response had no content'
    );
  });
});
