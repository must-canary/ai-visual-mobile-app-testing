import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  findValidate: vi.fn(),
  findLocate: vi.fn(),
  recordHit: vi.fn(),
  recordMiss: vi.fn(),
  saveValidate: vi.fn(),
  locate: vi.fn(),
  captureScreenshot: vi.fn(),
  saveScreenshot: vi.fn(),
  updateFrame: vi.fn(),
  withDriver: vi.fn(),
  tapAt: vi.fn(),
  resolveNativeTap: vi.fn(),
}));

vi.mock("@/lib/engine/locate-cache", () => ({
  PATCH_SIZE: 96,
  findLocate: mocks.findLocate,
  findValidate: mocks.findValidate,
  recordHit: mocks.recordHit,
  recordMiss: mocks.recordMiss,
  saveLocate: vi.fn(),
  saveValidate: mocks.saveValidate,
}));

vi.mock("@/lib/vision/locate", () => ({
  MIN_LOCATE_CONFIDENCE: 0.6,
  locate: mocks.locate,
  validate: mocks.validate,
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

vi.mock("@/lib/appium/session-manager", () => ({
  captureScreenshot: mocks.captureScreenshot,
  updateFrame: mocks.updateFrame,
  withDriver: mocks.withDriver,
}));

vi.mock("@/lib/appium/gestures", () => ({
  tapAt: mocks.tapAt,
  resolveNativeTap: mocks.resolveNativeTap,
  longPressAt: vi.fn(),
  typeText: vi.fn(),
  clearFocusedField: vi.fn(),
  hideKeyboardIfShown: vi.fn(),
  readFocusedText: vi.fn(),
  pressKey: vi.fn(),
  pressBack: vi.fn(),
  swipe: vi.fn(),
  activateApp: vi.fn(),
  backgroundApp: vi.fn(),
  terminateApp: vi.fn(),
  clearApp: vi.fn(),
}));

vi.mock("@/lib/engine/screenshot-store", () => ({
  saveScreenshot: mocks.saveScreenshot,
}));

import {
  executeStep,
  tapExpectationFor,
  verifyTapOutcome,
  StepFailure,
  type StepContext,
} from "@/lib/engine/step-executor";
import { emptyStages, EMPTY_USAGE, type StepResult } from "@/models/types";

function makeCtx(localFirst = false): StepContext {
  return {
    runId: "run-id",
    appId: "app-id",
    localFirst,
    signal: new AbortController().signal,
    usage: { ...EMPTY_USAGE },
    bus: { publish: vi.fn() },
    session: {
      shotSize: { w: 100, h: 200 },
      window: { w: 100, h: 200 },
    },
  } as unknown as StepContext;
}

function makeResult(): StepResult {
  return {
    index: 0,
    kind: "tap",
    status: "running",
    stages: emptyStages(),
  } as unknown as StepResult;
}

const firstAfter = { png: Buffer.from("after"), url: "/shot/0-after.png" };

function validateResult(result: boolean, evidence: string, reason: string) {
  return {
    value: { result, confidence: 0.95, evidence, reason },
    usage: { ...EMPTY_USAGE },
  };
}

describe("tap post-action expectations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockReset();
    mocks.findValidate.mockResolvedValue(null);
    mocks.captureScreenshot.mockResolvedValue(Buffer.from("retry"));
    mocks.saveScreenshot.mockResolvedValue("/shot/retry.png");
  });

  it("maps Copy address to an Address copied expectation", () => {
    const expectation = tapExpectationFor("Copy address");
    expect(expectation).not.toBeNull();
    expect(expectation?.id).toBe("address-copied");
    expect(expectation?.condition).toContain("Address copied");
    expect(expectation?.postTapDelayMs).toBe(500);
  });

  it("maps Share address to an Android share sheet expectation", () => {
    const expectation = tapExpectationFor("Share address");
    expect(expectation).not.toBeNull();
    expect(expectation?.id).toBe("share-sheet");
    expect(expectation?.condition).toContain("share sheet");
    expect(expectation?.condition).toContain("Sharing text");
    // Share address must not inherit the Copy address wait.
    expect(expectation?.postTapDelayMs).toBe(0);
  });

  it("leaves other tap targets, including Receive, without an expectation", () => {
    expect(tapExpectationFor("Receive")).toBeNull();
    expect(tapExpectationFor("Send")).toBeNull();
    expect(tapExpectationFor("Home")).toBeNull();
  });

  it("passes Copy address only once Address copied is actually observed", async () => {
    mocks.validate.mockResolvedValue(
      validateResult(true, '"Address copied" toast at the bottom', "Confirmation visible")
    );
    const ctx = makeCtx();
    const result = makeResult();
    const expectation = tapExpectationFor("Copy address")!;

    const detail = await verifyTapOutcome(ctx, result, 0, expectation, firstAfter);

    expect(detail).toContain("confirmed on attempt 1");
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.validate.mock.calls[0][0].condition).toContain("Address copied");
    expect(result.verify).toHaveLength(1);
    expect((result.verify as unknown as Array<{ result: boolean }>)[0].result).toBe(true);
  });

  it("fails Copy address with a clear verification error when the toast never appears", async () => {
    mocks.validate.mockResolvedValue(
      validateResult(false, "wallet address and a QR code", "No copied confirmation is visible")
    );
    const ctx = makeCtx();
    const result = makeResult();
    const expectation = tapExpectationFor("Copy address")!;

    const error = await verifyTapOutcome(ctx, result, 0, expectation, firstAfter).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(StepFailure);
    expect((error as Error).message).toContain("The tap executed but");
    expect((error as Error).message).toContain("was never visible afterwards");
    expect((error as Error).message).toContain("No copied confirmation is visible");
    // Transient by design: the toast is checked once, on the immediate frame.
    // Re-checking seconds later could only ever fail.
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(result.verify).toHaveLength(1);
  }, 20000);

  it("fails Share address with a clear verification error when the share sheet never opens", async () => {
    mocks.validate.mockResolvedValue(
      validateResult(false, "the Receive screen", "No share sheet is open")
    );
    const ctx = makeCtx();
    const result = makeResult();
    const expectation = tapExpectationFor("Share address")!;

    const error = await verifyTapOutcome(ctx, result, 0, expectation, firstAfter).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(StepFailure);
    expect((error as Error).message).toContain("the Android share sheet");
    expect((error as Error).message).toContain("was never visible afterwards");
    expect((error as Error).message).toContain("No share sheet is open");
  }, 20000);

  it("recaptures a fresh screenshot for later share-sheet attempts", async () => {
    mocks.validate
      .mockResolvedValueOnce(validateResult(false, "app screen", "Sheet not open yet"))
      .mockResolvedValueOnce(
        validateResult(true, '"Sharing text" over a share target list', "Sheet open")
      );
    const ctx = makeCtx();
    const result = makeResult();
    const expectation = tapExpectationFor("Share address")!;

    const detail = await verifyTapOutcome(ctx, result, 0, expectation, firstAfter);

    expect(detail).toContain("confirmed on attempt 2");
    expect(mocks.captureScreenshot).toHaveBeenCalledOnce();
    expect(result.verify).toHaveLength(2);
  }, 20000);

  it("stays Local First compatible by reusing a cached validation without a vision call", async () => {
    mocks.findValidate.mockResolvedValue({
      entry: { _id: "cache-entry", confidence: 0.99, evidence: '"Address copied"' },
    });
    const ctx = makeCtx(true);
    const result = makeResult();
    const expectation = tapExpectationFor("Copy address")!;

    const detail = await verifyTapOutcome(ctx, result, 0, expectation, firstAfter);

    expect(detail).toContain("confirmed on attempt 1");
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(ctx.usage.localHits).toBe(1);
    expect(mocks.recordHit).toHaveBeenCalledOnce();
    expect((result.verify as unknown as Array<{ source: string }>)[0].source).toBe("local");
  });
});

describe("tap post-action verification through executeStep", () => {
  const timeline: Array<{ event: string; at: number }> = [];

  function mark(event: string) {
    timeline.push({ event, at: Date.now() });
  }

  function timeOf(event: string): number {
    const hit = timeline.find((entry) => entry.event === event);
    if (!hit) throw new Error(`no timeline entry for ${event}`);
    return hit.at;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockReset();
    timeline.length = 0;

    mocks.findValidate.mockResolvedValue(null);
    mocks.findLocate.mockResolvedValue(null);
    mocks.saveScreenshot.mockImplementation(async (_runId, name: string) => `/shot/${name}`);
    mocks.captureScreenshot.mockImplementation(async () => {
      mark("capture");
      return Buffer.from("frame");
    });
    mocks.resolveNativeTap.mockResolvedValue(null);
    mocks.tapAt.mockImplementation(async () => {
      mark("tap");
    });
    mocks.withDriver.mockImplementation(
      async (_session: unknown, fn: (driver: unknown) => Promise<unknown>) => fn({})
    );
    mocks.locate.mockResolvedValue({
      value: {
        found: true,
        x: 500,
        y: 500,
        matched_text: "Copy address",
        confidence: 0.95,
        candidates: [],
        reason: "visible label",
      },
      usage: { ...EMPTY_USAGE },
    });
    mocks.validate.mockImplementation(async () => {
      mark("validate");
      return validateResult(true, '"Address copied"', "Confirmation visible");
    });
  });

  function tapStep(target: string) {
    return { kind: "tap" as const, lineNo: 1, raw: `Tap on ${target}`, target };
  }

  it("runs Copy address as tap -> 500ms wait -> AFTER capture -> verification", async () => {
    const result = await executeStep(makeCtx(), tapStep("Copy address"), 0);

    expect(result.status).toBe("passed");

    // Exact ordering of the four events.
    const order = timeline.map((entry) => entry.event);
    expect(order).toEqual(["capture", "tap", "capture", "validate"]);

    const tapAt = timeOf("tap");
    const afterCapture = timeline.filter((e) => e.event === "capture").find((e) => e.at >= tapAt);
    expect(afterCapture).toBeDefined();

    // The AFTER capture waits the declared 500ms — not longer, and in
    // particular not the 700ms verify-stage settle.
    const waited = (afterCapture as { at: number }).at - tapAt;
    expect(waited).toBeGreaterThanOrEqual(500);
    expect(waited).toBeLessThan(700);

    // Verification runs on that frame, after the capture.
    expect(timeOf("validate")).toBeGreaterThanOrEqual((afterCapture as { at: number }).at);
    expect(result.stages.act.detail).toContain("waited 500ms");
    expect(result.stages.act.detail).toContain("AFTER captured");
    expect(result.stages.verify.detail).toContain("confirmed on attempt 1");
  });

  it("does not apply the Copy address wait to Share address", async () => {
    mocks.validate.mockImplementation(async () => {
      mark("validate");
      return {
        value: {
          result: true,
          confidence: 0.96,
          evidence: '"Sharing text" over a share target list',
          reason: "sheet open",
        },
        usage: { ...EMPTY_USAGE },
      };
    });

    const result = await executeStep(makeCtx(), tapStep("Share address"), 0);

    expect(result.status).toBe("passed");
    const tapAt = timeOf("tap");
    const afterCapture = timeline.filter((e) => e.event === "capture").find((e) => e.at >= tapAt);
    expect((afterCapture as { at: number }).at - tapAt).toBeLessThan(300);
    expect(result.stages.act.detail).toContain("AFTER captured immediately");
    expect(result.stages.act.detail).not.toContain("waited");
  });

  it("passes Copy address only when Address copied is observed", async () => {
    const result = await executeStep(makeCtx(), tapStep("Copy address"), 0);

    expect(result.status).toBe("passed");
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.validate.mock.calls[0][0].condition).toContain("Address copied");
    expect(result.stages.verify.detail).toContain("confirmed on attempt 1");
  });

  it("fails Copy address when Address copied is absent, even though the tap succeeded", async () => {
    mocks.validate.mockImplementation(async () => {
      mark("validate");
      return {
        value: { result: false, confidence: 0.95, evidence: "QR code only", reason: "No copied confirmation" },
        usage: { ...EMPTY_USAGE },
      };
    });

    const result = await executeStep(makeCtx(), tapStep("Copy address"), 0);

    // The Appium tap itself succeeded...
    expect(mocks.tapAt).toHaveBeenCalledOnce();
    expect(result.stages.act.status).toBe("ok");
    // ...but the step must still fail.
    expect(result.status).toBe("failed");
    expect(result.error).toContain("was never visible afterwards");
    expect(result.stages.verify.status).toBe("fail");
  });

  it("fails Share address when the Android share sheet does not open", async () => {
    mocks.validate.mockImplementation(async () => {
      mark("validate");
      return {
        value: { result: false, confidence: 0.95, evidence: "the software keyboard", reason: "No share sheet" },
        usage: { ...EMPTY_USAGE },
      };
    });

    const result = await executeStep(makeCtx(), tapStep("Share address"), 0);

    expect(mocks.tapAt).toHaveBeenCalledOnce();
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Android share sheet");
    expect(mocks.validate.mock.calls[0][0].condition).toContain("Sharing text");
    expect(mocks.validate.mock.calls[0][0].condition).toContain("keyboard");
  }, 20000);

  it("passes Share address when the share sheet with Sharing text is observed", async () => {
    mocks.validate.mockImplementation(async () => {
      mark("validate");
      return {
        value: { result: true, confidence: 0.96, evidence: '"Sharing text" over a share target list', reason: "sheet open" },
        usage: { ...EMPTY_USAGE },
      };
    });

    const result = await executeStep(makeCtx(), tapStep("Share address"), 0);

    expect(result.status).toBe("passed");
    expect(result.stages.verify.detail).toContain("confirmed on attempt 1");
  });

  it("still passes an unrelated tap that has no expectation, without extra validation", async () => {
    const result = await executeStep(makeCtx(), tapStep("Receive"), 0);

    expect(result.status).toBe("passed");
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(result.stages.verify.detail).toBe("after screenshot captured");
  });
});
