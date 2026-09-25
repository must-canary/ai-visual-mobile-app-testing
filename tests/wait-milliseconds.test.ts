import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureScreenshot: vi.fn(),
  saveScreenshot: vi.fn(),
  updateFrame: vi.fn(),
}));

vi.mock("@/lib/engine/locate-cache", () => ({
  PATCH_SIZE: 96,
  findLocate: vi.fn(),
  findValidate: vi.fn(),
  recordHit: vi.fn(),
  recordMiss: vi.fn(),
  saveLocate: vi.fn(),
  saveValidate: vi.fn(),
}));

vi.mock("@/lib/vision/locate", () => ({
  MIN_LOCATE_CONFIDENCE: 0.6,
  locate: vi.fn(),
  validate: vi.fn(),
  addUsage: vi.fn(),
  explainLocateFailure: vi.fn(),
}));

vi.mock("@/lib/vision/image", () => ({ prepareImage: vi.fn() }));
vi.mock("@/lib/vision/phash", () => ({
  screenHash: vi.fn(),
  patchHash: vi.fn(),
  hamming: vi.fn(),
}));

vi.mock("@/lib/appium/session-manager", () => ({
  captureScreenshot: mocks.captureScreenshot,
  updateFrame: mocks.updateFrame,
  withDriver: vi.fn(),
}));

vi.mock("@/lib/engine/screenshot-store", () => ({
  saveScreenshot: mocks.saveScreenshot,
}));

import { parseScript } from "@/lib/dsl/parser";
import { executeStep, type StepContext } from "@/lib/engine/step-executor";
import { EMPTY_USAGE } from "@/models/types";
import type { WaitMsStep, WaitStep } from "@/lib/dsl/types";

function parseOne(line: string) {
  const parsed = parseScript(line);
  return { step: parsed.steps[0], errors: parsed.errors };
}

describe("Wait <n> milliseconds parsing", () => {
  it.each([600, 800, 1000])("parses Wait %i milliseconds", (ms) => {
    const { step, errors } = parseOne(`Wait ${ms} milliseconds`);
    expect(errors).toHaveLength(0);
    expect(step.kind).toBe("waitMs");
    expect((step as WaitMsStep).milliseconds).toBe(ms);
  });

  it("accepts any positive integer, not just the common values", () => {
    for (const ms of [1, 7, 250, 1234, 60000]) {
      const { step, errors } = parseOne(`Wait ${ms} milliseconds`);
      expect(errors).toHaveLength(0);
      expect((step as WaitMsStep).milliseconds).toBe(ms);
    }
  });

  it.each([
    "Wait 600 milliseconds",
    "wait 600 millisecond",
    "Wait for 600 milliseconds",
    "WAIT 600 MS",
    "Wait 600ms",
    "Wait 600 msec",
    "Wait Until 600 milliseconds",
  ])("accepts the phrasing %s", (line) => {
    const { step, errors } = parseOne(line);
    expect(errors).toHaveLength(0);
    expect(step.kind).toBe("waitMs");
    expect((step as WaitMsStep).milliseconds).toBe(600);
  });

  it("rejects non-positive values rather than silently waiting zero", () => {
    for (const line of ["Wait 0 milliseconds", "Wait -5 milliseconds"]) {
      const parsed = parseScript(line);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.steps).toHaveLength(0);
    }
  });

  it("leaves the existing seconds Wait untouched", () => {
    const untilSeconds = parseOne("Wait Until 2 Seconds");
    expect(untilSeconds.errors).toHaveLength(0);
    expect(untilSeconds.step.kind).toBe("wait");
    expect((untilSeconds.step as WaitStep).seconds).toBe(2);

    const bareSeconds = parseOne("Wait 3 seconds");
    expect(bareSeconds.step.kind).toBe("wait");
    expect((bareSeconds.step as WaitStep).seconds).toBe(3);

    const unitless = parseOne("Wait 5");
    expect(unitless.step.kind).toBe("wait");
    expect((unitless.step as WaitStep).seconds).toBe(5);

    const fractional = parseOne("Wait 1.5 seconds");
    expect(fractional.step.kind).toBe("wait");
    expect((fractional.step as WaitStep).seconds).toBe(1.5);
  });

  it("leaves Wait Until <target> is visible untouched", () => {
    const { step, errors } = parseOne('Wait Until "Receive" is visible');
    expect(errors).toHaveLength(0);
    expect(step.kind).toBe("waitVisible");
  });

  it("parses the full evidence script with zero unknown lines", () => {
    const script = [
      "OPEN_APP MPC",
      "Wait 1000 milliseconds",
      "UNLOCK_IF_NEEDED",
      "Validate that the MPC Home screen is visible",
      "Tap on Receive",
      "Validate that the Receive screen is visible",
      "Tap on Copy address",
      "Tap on Share address",
    ].join("\n");

    const parsed = parseScript(script);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.steps.map((s) => s.kind)).toEqual([
      "openApp",
      "waitMs",
      "unlockIfNeeded",
      "validate",
      "tap",
      "validate",
      "tap",
      "tap",
    ]);
    expect((parsed.steps[1] as WaitMsStep).milliseconds).toBe(1000);
  });
});

describe("Wait <n> milliseconds execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captureScreenshot.mockResolvedValue(Buffer.from("frame"));
    mocks.saveScreenshot.mockResolvedValue("/shot/x.png");
  });

  function makeCtx(): StepContext {
    return {
      runId: "run-id",
      appId: "app-id",
      localFirst: false,
      signal: new AbortController().signal,
      usage: { ...EMPTY_USAGE },
      bus: { publish: vi.fn() },
      session: { shotSize: { w: 100, h: 200 }, window: { w: 100, h: 200 } },
    } as unknown as StepContext;
  }

  function waitMsStep(milliseconds: number): WaitMsStep {
    return {
      kind: "waitMs",
      lineNo: 1,
      raw: `Wait ${milliseconds} milliseconds`,
      milliseconds,
    };
  }

  it.each([600, 1000])("pauses for the requested %ims", async (ms) => {
    const started = Date.now();
    const result = await executeStep(makeCtx(), waitMsStep(ms), 0);
    const elapsed = Date.now() - started;

    expect(result.status).toBe("passed");
    expect(result.stages.act.detail).toBe(`waited ${ms}ms`);
    // The act stage itself is the pause, timed independently of the
    // screenshot the verify stage takes afterwards.
    expect(result.stages.act.ms).toBeGreaterThanOrEqual(ms);
    expect(result.stages.act.ms).toBeLessThan(ms + 250);
    expect(elapsed).toBeGreaterThanOrEqual(ms);
  }, 10000);

  it("needs no target resolution", async () => {
    const result = await executeStep(makeCtx(), waitMsStep(600), 0);

    expect(result.stages.locate.status).toBe("skip");
    expect(result.stages.locate.detail).toBe("no target to resolve");
  }, 10000);

  it("waits the exact amount asked for, not a rounded one", async () => {
    const result = await executeStep(makeCtx(), waitMsStep(337), 0);

    expect(result.stages.act.detail).toBe("waited 337ms");
    expect(result.stages.act.ms).toBeGreaterThanOrEqual(337);
    expect(result.stages.act.ms).toBeLessThan(337 + 250);
  }, 10000);
});
