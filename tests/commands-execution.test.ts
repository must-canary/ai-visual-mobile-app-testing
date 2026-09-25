import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Step } from "@/lib/dsl/types";
import { EMPTY_USAGE } from "@/models/types";

const mocks = vi.hoisted(() => ({
  activateApp: vi.fn(),
  resolveInstalledAppByName: vi.fn(),
  locate: vi.fn(),
  tapAt: vi.fn(),
  longPressAt: vi.fn(),
  clearFocusedField: vi.fn(),
  typeText: vi.fn(),
  pressKey: vi.fn(),
  hideKeyboardIfShown: vi.fn(),
  validate: vi.fn(),
  captureScreenshot: vi.fn(),
  saveScreenshot: vi.fn(),
}));

vi.mock("@/lib/appium/gestures", () => ({
  activateApp: mocks.activateApp,
  backgroundApp: vi.fn(),
  clearApp: vi.fn(),
  clearFocusedField: mocks.clearFocusedField,
  hideKeyboardIfShown: mocks.hideKeyboardIfShown,
  longPressAt: mocks.longPressAt,
  pressBack: vi.fn(),
  pressKey: mocks.pressKey,
  readFocusedText: vi.fn(),
  swipe: vi.fn(),
  tapAt: mocks.tapAt,
  terminateApp: vi.fn(),
  typeText: mocks.typeText,
}));

vi.mock("@/lib/android/app-discovery", () => ({
  resolveInstalledAppByName: mocks.resolveInstalledAppByName,
}));

vi.mock("@/lib/appium/session-manager", () => ({
  captureScreenshot: mocks.captureScreenshot,
  updateFrame: vi.fn(),
  withDriver: vi.fn(async (session, fn) => fn(session.driver)),
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

vi.mock("@/lib/engine/screenshot-store", () => ({
  saveScreenshot: mocks.saveScreenshot,
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
  hamming: vi.fn().mockReturnValue(10),
  patchHash: vi.fn().mockResolvedValue("patch"),
  screenHash: vi.fn().mockResolvedValue("screen"),
}));

vi.mock("@/lib/vision/locate", () => ({
  MIN_LOCATE_CONFIDENCE: 0.6,
  addUsage: vi.fn(),
  explainLocateFailure: vi.fn().mockReturnValue("not found"),
  locate: mocks.locate,
  validate: mocks.validate,
}));

import { executeStep, type StepContext } from "@/lib/engine/step-executor";

function context() {
  return {
    runId: "run",
    appId: "app",
    localFirst: false,
    signal: new AbortController().signal,
    usage: { ...EMPTY_USAGE },
    bus: { publish: vi.fn() },
    session: {
      packageName: "com.example",
      shotSize: { w: 100, h: 200 },
      window: { w: 100, h: 200 },
      driver: { pause: vi.fn() },
    },
  } as unknown as StepContext;
}

async function run(step: Step) {
  const ctx = context();
  const pending = executeStep(ctx, step, 0);
  await vi.runAllTimersAsync();
  return { result: await pending, ctx };
}

describe("reusable command execution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.captureScreenshot.mockResolvedValue(Buffer.from("screen"));
    mocks.saveScreenshot.mockResolvedValue("/screen.png");
    delete process.env.MPC_PIN;
    mocks.locate.mockResolvedValue({
      value: {
        found: true,
        x: 500,
        y: 500,
        matched_text: "target",
        confidence: 0.99,
        candidates: [],
        reason: "",
      },
      usage: {},
    });
    mocks.resolveInstalledAppByName.mockResolvedValue({
      label: "MPC",
      packageName: "tech.globalmpc.mpc_mining_app",
      activity: "tech.globalmpc.mpc_mining_app.MainActivity",
    });
  });

  it.each([
    ["waitVisible", { kind: "waitVisible", target: "Save" }],
    ["longPress", { kind: "longPress", target: "message" }],
    ["select", { kind: "select", option: "Weekly", target: "frequency" }],
    ["check", { kind: "check", target: "newsletter" }],
    ["uncheck", { kind: "uncheck", target: "newsletter" }],
    ["clear", { kind: "clear", target: "email" }],
  ] as const)("executes %s through visual location and logs its kind/result", async (kind, fields) => {
    const step = { ...fields, lineNo: 7, raw: kind } as Step;
    const { result, ctx } = await run(step);

    expect(result).toMatchObject({ kind, lineNo: 7, status: "passed" });
    expect(result.locate?.source).toBe("vision");
    expect(mocks.locate).toHaveBeenCalled();
    expect(ctx.bus.publish).toHaveBeenCalledWith(
      "step:start",
      expect.objectContaining({ kind })
    );
    expect(ctx.bus.publish).toHaveBeenCalledWith(
      "step:end",
      expect.objectContaining({ status: "passed" })
    );
  });

  it("performs each visual command's intended gesture", async () => {
    await run({ kind: "longPress", target: "message", lineNo: 0, raw: "long" });
    expect(mocks.longPressAt).toHaveBeenCalledOnce();

    await run({ kind: "select", option: "Weekly", target: "frequency", lineNo: 0, raw: "select" });
    expect(mocks.tapAt).toHaveBeenCalledTimes(2);

    await run({ kind: "check", target: "newsletter", lineNo: 0, raw: "check" });
    await run({ kind: "uncheck", target: "newsletter", lineNo: 0, raw: "uncheck" });
    expect(mocks.tapAt).toHaveBeenCalledTimes(4);

    await run({ kind: "clear", target: "email", lineNo: 0, raw: "clear" });
    expect(mocks.clearFocusedField).toHaveBeenCalledOnce();
  });

  it.each([
    ["pressKey", { kind: "pressKey", key: "ENTER" }],
    ["hideKeyboard", { kind: "hideKeyboard" }],
  ] as const)("executes %s without vision and logs its result", async (kind, fields) => {
    const { result, ctx } = await run({ ...fields, lineNo: 2, raw: kind } as Step);

    expect(result).toMatchObject({ kind, status: "passed" });
    expect(result.stages.locate).toMatchObject({ status: "skip" });
    expect(mocks.locate).not.toHaveBeenCalled();
    expect(ctx.bus.publish).toHaveBeenCalledWith(
      "step:start",
      expect.objectContaining({ kind })
    );
  });

  it("dispatches key and keyboard actions", async () => {
    await run({ kind: "pressKey", key: "ENTER", lineNo: 0, raw: "press" });
    await run({ kind: "hideKeyboard", lineNo: 0, raw: "hide" });

    expect(mocks.pressKey).toHaveBeenCalledWith(expect.anything(), "ENTER");
    expect(mocks.hideKeyboardIfShown).toHaveBeenCalledOnce();
  });

  it("opens the selected app when OPEN_APP has no argument", async () => {
    const { result } = await run({
      kind: "openApp",
      packageName: null,
      lineNo: 0,
      raw: "OPEN_APP",
    });

    expect(result.status).toBe("passed");
    expect(mocks.resolveInstalledAppByName).not.toHaveBeenCalled();
    expect(mocks.activateApp).toHaveBeenCalledWith(expect.anything(), "com.example");
  });

  it("opens a direct package without app-name discovery", async () => {
    const { result } = await run({
      kind: "openApp",
      packageName: "com.example.other",
      lineNo: 0,
      raw: "OPEN_APP com.example.other",
    });

    expect(result.status).toBe("passed");
    expect(mocks.resolveInstalledAppByName).not.toHaveBeenCalled();
    expect(mocks.activateApp).toHaveBeenCalledWith(expect.anything(), "com.example.other");
  });

  it("discovers an app label and logs all resolved launch metadata", async () => {
    const { result } = await run({
      kind: "openApp",
      packageName: "MPC",
      lineNo: 0,
      raw: "OPEN_APP MPC",
    });

    expect(result.status).toBe("passed");
    expect(mocks.resolveInstalledAppByName).toHaveBeenCalledWith("MPC");
    expect(mocks.activateApp).toHaveBeenCalledWith(
      expect.anything(),
      "tech.globalmpc.mpc_mining_app"
    );
    expect(result.stages.act.detail).toContain('requested="MPC"');
    expect(result.stages.act.detail).toContain('resolved="MPC"');
    expect(result.stages.act.detail).toContain("package=tech.globalmpc.mpc_mining_app");
    expect(result.stages.act.detail).toContain(
      "activity=tech.globalmpc.mpc_mining_app.MainActivity"
    );
    expect(result.stages.act.detail).toContain("launch=activated");
  });

  it("passes without acting when the MPC wallet is already unlocked", async () => {
    mocks.validate.mockResolvedValueOnce({
      value: {
        result: true,
        confidence: 0.99,
        evidence: "MPC Home is visible",
        reason: "",
      },
      usage: {},
    });

    const { result } = await run({
      kind: "unlockIfNeeded",
      lineNo: 0,
      raw: "UNLOCK_IF_NEEDED",
    });

    expect(result).toMatchObject({ kind: "unlockIfNeeded", status: "passed" });
    expect(result.stages.act.detail).toBe("wallet already unlocked");
    expect(result.stages.verify.detail).toBe("wallet already unlocked");
    expect(mocks.locate).not.toHaveBeenCalled();
    expect(mocks.typeText).not.toHaveBeenCalled();
    expect(mocks.tapAt).not.toHaveBeenCalled();
  });

  it("unlocks a locked MPC wallet with MPC_PIN and verifies Home", async () => {
    process.env.MPC_PIN = "739105";
    mocks.validate
      .mockResolvedValueOnce({
        value: { result: false, confidence: 0.99, evidence: "", reason: "Home absent" },
        usage: {},
      })
      .mockResolvedValueOnce({
        value: {
          result: true,
          confidence: 0.99,
          evidence: "Welcome back, PIN, and Unlock wallet are visible",
          reason: "",
        },
        usage: {},
      })
      .mockResolvedValueOnce({
        value: { result: true, confidence: 0.99, evidence: "MPC Home is visible", reason: "" },
        usage: {},
      });

    const { result } = await run({
      kind: "unlockIfNeeded",
      lineNo: 0,
      raw: "UNLOCK_IF_NEEDED",
    });

    expect(result).toMatchObject({ kind: "unlockIfNeeded", status: "passed" });
    expect(mocks.locate).toHaveBeenCalledTimes(2);
    expect(mocks.typeText).toHaveBeenCalledWith(expect.anything(), "739105");
    expect(mocks.tapAt).toHaveBeenCalledTimes(2);
    expect(result.stages.verify.detail).toContain("MPC Home visible");
  });

  it("fails a locked MPC wallet when MPC_PIN is missing", async () => {
    mocks.validate
      .mockResolvedValueOnce({
        value: { result: false, confidence: 0.99, evidence: "", reason: "Home absent" },
        usage: {},
      })
      .mockResolvedValueOnce({
        value: {
          result: true,
          confidence: 0.99,
          evidence: "Welcome back lock screen is visible",
          reason: "",
        },
        usage: {},
      });

    const { result } = await run({
      kind: "unlockIfNeeded",
      lineNo: 0,
      raw: "UNLOCK_IF_NEEDED",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("MPC_PIN must be set in .env.local");
    expect(mocks.locate).not.toHaveBeenCalled();
    expect(mocks.typeText).not.toHaveBeenCalled();
  });

  it("redacts MPC_PIN from results, events, errors, and screenshot metadata", async () => {
    const secret = "pin-secret-4829";
    process.env.MPC_PIN = secret;
    mocks.validate
      .mockResolvedValueOnce({
        value: { result: false, confidence: 0.99, evidence: "", reason: "Home absent" },
        usage: {},
      })
      .mockResolvedValueOnce({
        value: { result: true, confidence: 0.99, evidence: "wallet locked", reason: "" },
        usage: {},
      });
    mocks.typeText.mockRejectedValueOnce(new Error(`driver rejected ${secret}`));

    const { result, ctx } = await run({
      kind: "unlockIfNeeded",
      lineNo: 0,
      raw: "UNLOCK_IF_NEEDED",
    });
    const externallyVisible = JSON.stringify({
      result,
      events: vi.mocked(ctx.bus.publish).mock.calls,
      screenshotMetadata: mocks.saveScreenshot.mock.calls,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Could not securely enter MPC_PIN into the wallet PIN field");
    expect(externallyVisible).not.toContain(secret);
  });
});
