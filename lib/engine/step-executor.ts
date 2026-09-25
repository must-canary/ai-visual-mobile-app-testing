import { CoordinateMapper, scrollToSwipeDirection } from "@/lib/appium/coords";
import {
  activateApp,
  backgroundApp,
  clearApp,
  clearFocusedField,
  hideKeyboardIfShown,
  longPressAt,
  pressKey,
  pressBack,
  readFocusedText,
  resolveNativeTap,
  swipe,
  tapAt,
  terminateApp,
  typeText,
} from "@/lib/appium/gestures";
import {
  captureScreenshot,
  updateFrame,
  withDriver,
  type LiveSession,
} from "@/lib/appium/session-manager";
import type { Step } from "@/lib/dsl/types";
import { env } from "@/lib/env";
import { resolveInstalledAppByName } from "@/lib/android/app-discovery";
import type { RunEventBus } from "@/lib/engine/events";
import {
  findLocate,
  findValidate,
  recordHit,
  recordMiss,
  saveLocate,
  saveValidate,
} from "@/lib/engine/locate-cache";
import { saveScreenshot } from "@/lib/engine/screenshot-store";
import { addUsage, explainLocateFailure, locate, validate, MIN_LOCATE_CONFIDENCE } from "@/lib/vision/locate";
import { prepareImage } from "@/lib/vision/image";
import { hamming, patchHash, screenHash } from "@/lib/vision/phash";
import { PATCH_SIZE } from "@/lib/engine/locate-cache";
import {
  emptyStages,
  type LocateInfo,
  type StageName,
  type StepResult,
  type Usage,
  type VerifyAttempt,
} from "@/models/types";

export class StepFailure extends Error {}
export class RunAborted extends Error {}

const HEAL_DISTANCE_PX = 40;
const SCREEN_SAME_DISTANCE = 2;
const SETTLE_MS = 700;
const APP_SETTLE_MS = 2500;
const VERIFY_ATTEMPTS = 3;
const VERIFY_GAP_MS = 1500;
const SCROLL_UNTIL_MAX = 8;
const WAIT_VISIBLE_ATTEMPTS = 8;
const MPC_HOME_CONDITION =
  "the MPC wallet Home screen is visible, and this is not a Create wallet, Restore wallet, Welcome back, or PIN unlock screen";
const MPC_LOCK_CONDITION =
  'the MPC wallet lock screen is visible with "Welcome back", a PIN input field, and an "Unlock wallet" control';

export type StepContext = {
  runId: string;
  session: LiveSession;
  bus: RunEventBus;
  signal: AbortSignal;
  usage: Usage;
  localFirst: boolean;
  appId: string;
};

function checkAbort(ctx: StepContext): void {
  if (ctx.signal.aborted) throw new RunAborted("Run stopped");
}

async function sleep(ctx: StepContext, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    checkAbort(ctx);
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, end - Date.now())));
  }
}

async function runStage<T>(
  ctx: StepContext,
  result: StepResult,
  stage: StageName,
  fn: () => Promise<{ detail: string; value: T }>
): Promise<T> {
  checkAbort(ctx);
  const started = Date.now();
  result.stages[stage].status = "running";
  ctx.bus.publish("stage", {
    index: result.index,
    stage,
    status: "start",
    ms: 0,
    detail: "",
  });
  try {
    const { detail, value } = await fn();
    const ms = Date.now() - started;
    result.stages[stage] = { status: "ok", ms, detail };
    ctx.bus.publish("stage", { index: result.index, stage, status: "ok", ms, detail });
    return value;
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof RunAborted) {
      result.stages[stage] = { status: "skip", ms, detail: "stopped" };
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    result.stages[stage] = { status: "fail", ms, detail };
    ctx.bus.publish("stage", { index: result.index, stage, status: "fail", ms, detail });
    throw error instanceof StepFailure ? error : new StepFailure(detail);
  }
}

function skipStage(
  ctx: StepContext,
  result: StepResult,
  stage: StageName,
  detail: string
): void {
  result.stages[stage] = { status: "skip", ms: 0, detail };
  ctx.bus.publish("stage", {
    index: result.index,
    stage,
    status: "skip",
    ms: 0,
    detail,
  });
}

async function capture(
  ctx: StepContext,
  index: number,
  phase: "before" | "after",
  suffix = ""
): Promise<{ png: Buffer; url: string }> {
  const png = await captureScreenshot(ctx.session);
  await updateFrame(ctx.session, png, "run");
  const url = await saveScreenshot(
    ctx.runId,
    `${index}-${phase}${suffix}.png`,
    png
  );
  ctx.bus.publish("screenshot", { index, phase, url });
  return { png, url };
}

function mapperFor(session: LiveSession, sentW: number, sentH: number): CoordinateMapper {
  return new CoordinateMapper({
    shotW: session.shotSize.w,
    shotH: session.shotSize.h,
    sentW,
    sentH,
    winW: session.window.w,
    winH: session.window.h,
  });
}

type Resolution = {
  info: LocateInfo;
  deviceX: number;
  deviceY: number;
  sentPng: Buffer;
  sentW: number;
  sentH: number;
  screenHash: string;
  cacheId?: import("mongodb").ObjectId;
  fromCache: boolean;
};

export async function resolveTarget(
  ctx: StepContext,
  index: number,
  description: string,
  png: Buffer,
  allowCache: boolean
): Promise<Resolution> {
  const prepared = await prepareImage(png);
  const hash = await screenHash(prepared.buffer);
  const mapper = mapperFor(ctx.session, prepared.sentW, prepared.sentH);

  if (allowCache && ctx.localFirst) {
    const hit = await findLocate({
      appId: ctx.appId,
      description,
      sentPng: prepared.buffer,
      screenHash: hash,
      sentW: prepared.sentW,
      sentH: prepared.sentH,
    });
    if (hit && hit.entry.x !== null && hit.entry.y !== null) {
      const device = mapper.toDevice(hit.entry.x, hit.entry.y);
      ctx.usage.localHits += 1;
      await recordHit(hit.entry._id, ctx.runId);
      const info: LocateInfo = {
        found: true,
        x: hit.entry.x,
        y: hit.entry.y,
        matchedText: hit.entry.matchedText,
        confidence: hit.entry.confidence,
        candidates: [],
        reason: "Reused from local history",
        sentW: prepared.sentW,
        sentH: prepared.sentH,
        deviceX: device.x,
        deviceY: device.y,
        source: "local",
        screenDistance: hit.screenDistance,
      };
      ctx.bus.publish("locate", { index, result: info });
      return {
        info,
        deviceX: device.x,
        deviceY: device.y,
        sentPng: prepared.buffer,
        sentW: prepared.sentW,
        sentH: prepared.sentH,
        screenHash: hash,
        cacheId: hit.entry._id,
        fromCache: true,
      };
    }
  }

  let outcome: Awaited<ReturnType<typeof locate>>;
  try {
    outcome = await locate({
      imageBase64: prepared.base64,
      sentW: prepared.sentW,
      sentH: prepared.sentH,
      target: description,
      signal: ctx.signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new StepFailure(`Visual locator could not resolve "${description}": ${detail}`);
  }
  addUsage(ctx.usage, outcome.usage);
  ctx.usage.calls = ctx.usage.calls;
  const value = outcome.value;
  const sentPoint =
    value.x !== null && value.y !== null
      ? mapper.visionToSent(value.x, value.y)
      : { x: null, y: null };
  const ok =
    value.found &&
    value.x !== null &&
    value.y !== null &&
    value.confidence >= MIN_LOCATE_CONFIDENCE &&
    value.candidates.length <= 1;
  const device =
    sentPoint.x !== null && sentPoint.y !== null
      ? mapper.toDevice(sentPoint.x, sentPoint.y)
      : { x: null, y: null };

  const candidates = value.candidates.map((candidate) => ({
    ...mapper.visionToSent(candidate.x, candidate.y),
    label: candidate.label,
  }));

  const info: LocateInfo = {
    found: Boolean(ok),
    x: sentPoint.x,
    y: sentPoint.y,
    matchedText: value.matched_text,
    confidence: value.confidence,
    candidates,
    reason: value.reason,
    sentW: prepared.sentW,
    sentH: prepared.sentH,
    deviceX: device.x,
    deviceY: device.y,
    source: "vision",
    screenDistance: null,
  };
  ctx.bus.publish("locate", { index, result: info });

  if (!ok) {
    throw new StepFailure(explainLocateFailure(description, value));
  }

  if (ctx.localFirst) {
    await saveLocate({
      appId: ctx.appId,
      description,
      sentPng: prepared.buffer,
      screenHash: hash,
      sentW: prepared.sentW,
      sentH: prepared.sentH,
      x: sentPoint.x as number,
      y: sentPoint.y as number,
      matchedText: value.matched_text,
      confidence: value.confidence,
      runId: ctx.runId,
    });
  }

  return {
    info,
    deviceX: device.x as number,
    deviceY: device.y as number,
    sentPng: prepared.buffer,
    sentW: prepared.sentW,
    sentH: prepared.sentH,
    screenHash: hash,
    fromCache: false,
  };
}

async function screenChanged(
  before: Buffer,
  afterPng: Buffer,
  point: { x: number; y: number } | null
): Promise<boolean> {
  const beforePrepared = await prepareImage(before);
  const afterPrepared = await prepareImage(afterPng);
  const beforeHash = await screenHash(beforePrepared.buffer);
  const afterHash = await screenHash(afterPrepared.buffer);
  if (hamming(beforeHash, afterHash) > SCREEN_SAME_DISTANCE) return true;
  if (!point) return false;
  const beforePatch = await patchHash(
    beforePrepared.buffer,
    point.x,
    point.y,
    PATCH_SIZE * 2
  );
  const afterPatch = await patchHash(
    afterPrepared.buffer,
    point.x,
    point.y,
    PATCH_SIZE * 2
  );
  return hamming(beforePatch, afterPatch) > SCREEN_SAME_DISTANCE;
}

async function checkVisualCondition(
  ctx: StepContext,
  description: string,
  png: Buffer
): Promise<{ result: boolean; confidence: number; evidence: string; reason: string; source: "vision" | "local" }> {
  const prepared = await prepareImage(png);
  const hash = await screenHash(prepared.buffer);

  if (ctx.localFirst) {
    const hit = await findValidate({
      appId: ctx.appId,
      description,
      screenHash: hash,
      sentW: prepared.sentW,
      sentH: prepared.sentH,
    });
    if (hit) {
      ctx.usage.localHits += 1;
      await recordHit(hit.entry._id, ctx.runId);
      return {
        result: true,
        confidence: hit.entry.confidence,
        evidence: hit.entry.evidence ?? "",
        reason: "Reused from local history",
        source: "local",
      };
    }
  }

  const outcome = await validate({
    imageBase64: prepared.base64,
    sentW: prepared.sentW,
    sentH: prepared.sentH,
    condition: description,
    signal: ctx.signal,
  });
  addUsage(ctx.usage, outcome.usage);

  if (outcome.value.result && ctx.localFirst) {
    await saveValidate({
      appId: ctx.appId,
      description,
      screenHash: hash,
      sentW: prepared.sentW,
      sentH: prepared.sentH,
      confidence: outcome.value.confidence,
      evidence: outcome.value.evidence,
      runId: ctx.runId,
    });
  }

  return { ...outcome.value, source: "vision" };
}

/**
 * Post-action expectations for taps whose success is not proven by the tap
 * itself. A tap dispatching is not evidence that the app did anything, so these
 * describe, in plain English, what must be visible afterwards. Matching is on
 * the step's own target text from the script — no element selectors, no
 * coordinates, and nothing platform-specific.
 */
export type TapExpectation = {
  id: string;
  label: string;
  condition: string;
  /** How many times the expected result may be looked for. 1 = transient. */
  attempts: number;
  /** Pause between the tap and the AFTER screenshot. 0 = capture at once. */
  postTapDelayMs: number;
};

type TapExpectationRule = TapExpectation & {
  matches: (normalizedTarget: string) => boolean;
};

const TAP_EXPECTATIONS: TapExpectationRule[] = [
  {
    id: "address-copied",
    label: "the address-copied confirmation",
    condition:
      'a confirmation that the address was copied is visible, such as a toast, snackbar or inline message reading "Address copied"',
    // A toast fades within a second, so it only ever exists on the screenshot
    // taken right after the tap. Re-checking later would always fail.
    attempts: 1,
    // The toast needs a moment to render, but must be caught before it fades.
    postTapDelayMs: 500,
    matches: (target) => target.includes("copy") && target.includes("address"),
  },
  {
    id: "share-sheet",
    label: 'the Android share sheet showing "Sharing text"',
    condition:
      'the Android system share sheet has opened as a bottom sheet sliding up over the app, showing "Sharing text" together with a list of apps or contacts to share with. The software keyboard, or the app screen on its own, does not satisfy this.',
    // The sheet stays open once shown, so it tolerates a couple of re-checks.
    attempts: VERIFY_ATTEMPTS,
    // The sheet animates in and stays put; no wait needed before capturing.
    postTapDelayMs: 0,
    matches: (target) => target.includes("share") && target.includes("address"),
  },
];

export function tapExpectationFor(target: string): TapExpectation | null {
  const normalized = target.toLowerCase();
  const rule = TAP_EXPECTATIONS.find((entry) => entry.matches(normalized));
  if (!rule) return null;
  return {
    id: rule.id,
    label: rule.label,
    condition: rule.condition,
    attempts: rule.attempts,
    postTapDelayMs: rule.postTapDelayMs,
  };
}

/**
 * Runs the existing visual validation pipeline against the AFTER screenshot and
 * only lets the step pass once the expected result is actually observed. Goes
 * through checkVisualCondition, so Local First hits and saves behave exactly as
 * they do for a Validate step.
 */
export async function verifyTapOutcome(
  ctx: StepContext,
  result: StepResult,
  index: number,
  expectation: TapExpectation,
  firstAfter: { png: Buffer; url: string }
): Promise<string> {
  const attempts: VerifyAttempt[] = Array.isArray(result.verify) ? result.verify : [];
  result.verify = attempts;

  const budget = Math.max(1, expectation.attempts);

  for (let attempt = 1; attempt <= budget; attempt += 1) {
    checkAbort(ctx);
    const shot =
      attempt === 1
        ? firstAfter
        : await capture(ctx, index, "after", `-${expectation.id}-${attempt}`);
    result.afterUrl = shot.url;

    const observed = await checkVisualCondition(ctx, expectation.condition, shot.png);
    const entry: VerifyAttempt = {
      attempt,
      result: observed.result,
      confidence: observed.confidence,
      evidence: observed.evidence,
      reason: observed.reason,
      screenshotUrl: shot.url,
      source: observed.source,
    };
    attempts.push(entry);
    ctx.bus.publish("verify", { index, attempt: entry });

    if (observed.result) {
      return `${expectation.label} was confirmed on attempt ${attempt}: ${observed.evidence}`;
    }

    if (attempt < budget) await sleep(ctx, VERIFY_GAP_MS);
  }

  const last = attempts[attempts.length - 1];
  throw new StepFailure(
    `The tap executed but ${expectation.label} was never visible afterwards, so the step did not pass. Expected ${expectation.condition}. ${
      last?.reason ?? ""
    }`.trim()
  );
}

function packageFor(ctx: StepContext, step: Step): string {
  const named = "packageName" in step ? step.packageName : null;
  return named ?? ctx.session.packageName;
}

function isAndroidPackage(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value);
}

export async function executeStep(
  ctx: StepContext,
  step: Step,
  index: number
): Promise<StepResult> {
  const startedAt = Date.now();
  const tokensBefore = ctx.usage.inputTokens + ctx.usage.outputTokens;

  const result: StepResult = {
    index,
    lineNo: step.lineNo,
    raw: step.raw,
    kind: step.kind,
    status: "running",
    stages: emptyStages(),
    beforeUrl: null,
    afterUrl: null,
    tokens: 0,
    latencyMs: 0,
    error: null,
  };

  ctx.bus.publish("step:start", {
    index,
    lineNo: step.lineNo,
    raw: step.raw,
    kind: step.kind,
  });

  try {
    const before = await runStage(ctx, result, "capture", async () => {
      const shot = await capture(ctx, index, "before");
      result.beforeUrl = shot.url;
      return { detail: `${ctx.session.shotSize.w}x${ctx.session.shotSize.h}`, value: shot.png };
    });

    await runStage(ctx, result, "classify", async () => ({
      detail: `${step.kind} handler`,
      value: null,
    }));

    let resolution: Resolution | null = null;
    let healed = false;
    let immediateAfter: { png: Buffer; url: string } | null = null;
    let walletAlreadyUnlocked = false;
    let walletUnlockAttempted = false;

    switch (step.kind) {
      case "tap": {
        resolution = await runStage(ctx, result, "locate", async () => {
          const found = await resolveTarget(ctx, index, step.target, before, true);
          result.locate = found.info;
          return {
            detail: `${found.info.matchedText ?? step.target} @ ${found.deviceX},${found.deviceY} (${found.info.source})`,
            value: found,
          };
        });

        await runStage(ctx, result, "act", async () => {
          // The visual point can land outside the element it named. Associate it
          // with the native accessibility element carrying the same label and tap
          // that element's centre instead. Purely a coordinate correction: the
          // gesture, the locator and the mapper are untouched, and a target with
          // no single matching native element keeps the visual point.
          const tap = await withDriver(ctx.session, async (driver) => {
            const snapped = await resolveNativeTap(
              driver,
              { x: resolution!.deviceX, y: resolution!.deviceY },
              resolution!.info.matchedText ?? step.target
            );
            const x = snapped ? snapped.x : resolution!.deviceX;
            const y = snapped ? snapped.y : resolution!.deviceY;
            await tapAt(driver, x, y);
            return { x, y, snapped };
          });
          const tapped = tap.snapped
            ? `tap ${tap.x},${tap.y} (corrected from ${resolution!.deviceX},${resolution!.deviceY} onto native "${tap.snapped.label}")`
            : `tap ${tap.x},${tap.y}`;

          // "Address copied" is a toast and is gone before the settle delay in
          // the verify stage elapses. An expectation-bearing tap therefore takes
          // its AFTER frame here, in the same stage as the gesture, waiting only
          // the short beat the expectation itself asks for.
          const expectation = tapExpectationFor(step.target);
          if (expectation) {
            if (expectation.postTapDelayMs > 0) {
              await sleep(ctx, expectation.postTapDelayMs);
            }
            immediateAfter = await capture(
              ctx,
              index,
              "after",
              `-${expectation.id}-1`
            );
            result.afterUrl = immediateAfter.url;
            return {
              detail:
                expectation.postTapDelayMs > 0
                  ? `${tapped}; waited ${expectation.postTapDelayMs}ms; AFTER captured`
                  : `${tapped}; AFTER captured immediately`,
              value: null,
            };
          }

          return { detail: tapped, value: null };
        });
        break;
      }

      case "longPress":
      case "check":
      case "uncheck":
      case "clear": {
        resolution = await runStage(ctx, result, "locate", async () => {
          const found = await resolveTarget(ctx, index, step.target, before, true);
          result.locate = found.info;
          return {
            detail: `${found.info.matchedText ?? step.target} @ ${found.deviceX},${found.deviceY} (${found.info.source})`,
            value: found,
          };
        });

        await runStage(ctx, result, "act", async () => {
          await withDriver(ctx.session, async (driver) => {
            if (step.kind === "longPress") {
              await longPressAt(driver, resolution!.deviceX, resolution!.deviceY);
            } else {
              await tapAt(driver, resolution!.deviceX, resolution!.deviceY);
              if (step.kind === "clear") {
                await driver.pause(300);
                await clearFocusedField(driver);
              }
            }
          });
          return {
            detail:
              step.kind === "longPress"
                ? `long press ${resolution!.deviceX},${resolution!.deviceY}`
                : step.kind === "clear"
                  ? `cleared ${step.target}`
                  : `${step.kind} ${step.target}`,
            value: null,
          };
        });
        break;
      }

      case "select": {
        resolution = await runStage(ctx, result, "locate", async () => {
          const found = await resolveTarget(ctx, index, step.target, before, true);
          result.locate = found.info;
          return {
            detail: `${found.info.matchedText ?? step.target} @ ${found.deviceX},${found.deviceY} (${found.info.source})`,
            value: found,
          };
        });

        await runStage(ctx, result, "act", async () => {
          await withDriver(ctx.session, (driver) =>
            tapAt(driver, resolution!.deviceX, resolution!.deviceY)
          );
          await sleep(ctx, 500);
          const opened = await capture(ctx, index, "before", "-select-options");
          const option = await resolveTarget(ctx, index, step.option, opened.png, true);
          result.locate = option.info;
          await withDriver(ctx.session, (driver) =>
            tapAt(driver, option.deviceX, option.deviceY)
          );
          return { detail: `selected "${step.option}" from ${step.target}`, value: null };
        });
        break;
      }

      case "waitVisible": {
        let attempts = 0;
        let found = false;
        const locateOnce = async (png: Buffer): Promise<boolean> => {
          attempts += 1;
          try {
            const located = await resolveTarget(ctx, index, step.target, png, true);
            result.locate = located.info;
            resolution = located;
            return true;
          } catch {
            return false;
          }
        };
        found = await runStage(ctx, result, "locate", async () => {
          const visible = await locateOnce(before);
          return { detail: visible ? "visible" : "not visible yet", value: visible };
        });
        await runStage(ctx, result, "act", async () => {
          while (!found && attempts < WAIT_VISIBLE_ATTEMPTS) {
            await sleep(ctx, 750);
            const shot = await capture(ctx, index, "before", `-wait-${attempts + 1}`);
            found = await locateOnce(shot.png);
          }
          if (!found) {
            throw new StepFailure(
              `"${step.target}" did not become visible after ${attempts} attempts`
            );
          }
          return { detail: `visible after ${attempts} attempt(s)`, value: null };
        });
        break;
      }

      case "type": {
        if (step.field) {
          resolution = await runStage(ctx, result, "locate", async () => {
            const found = await resolveTarget(ctx, index, step.field as string, before, true);
            result.locate = found.info;
            return {
              detail: `${found.info.matchedText ?? step.field} @ ${found.deviceX},${found.deviceY} (${found.info.source})`,
              value: found,
            };
          });
        } else {
          skipStage(ctx, result, "locate", "typing into the focused field");
        }

        await runStage(ctx, result, "act", async () => {
          await withDriver(ctx.session, async (driver) => {
            if (resolution) {
              await tapAt(driver, resolution.deviceX, resolution.deviceY);
              await driver.pause(300);
            }
            await clearFocusedField(driver);
            await typeText(driver, step.text);
            await driver.pause(300);
          });
          const readBack = await withDriver(ctx.session, (driver) =>
            readFocusedText(driver)
          );
          await withDriver(ctx.session, (driver) => hideKeyboardIfShown(driver));
          return {
            detail: readBack ? `typed "${step.text}", field reads "${readBack}"` : `typed "${step.text}"`,
            value: null,
          };
        });
        break;
      }

      case "scroll": {
        skipStage(ctx, result, "locate", "no target to resolve");
        await runStage(ctx, result, "act", async () => {
          const direction = scrollToSwipeDirection(step.direction);
          await withDriver(ctx.session, (driver) =>
            swipe(driver, direction, ctx.session.window.w, ctx.session.window.h, step.percent)
          );
          return {
            detail: `scroll ${step.direction} (swipe ${direction} ${Math.round(step.percent * 100)}%)`,
            value: null,
          };
        });
        break;
      }

      case "scrollUntil": {
        let attempts = 0;
        let found = false;
        const locateOnce = async (png: Buffer): Promise<boolean> => {
          try {
            const res = await resolveTarget(ctx, index, step.target, png, true);
            result.locate = res.info;
            resolution = res;
            return true;
          } catch {
            return false;
          }
        };

        found = await runStage(ctx, result, "locate", async () => {
          const ok = await locateOnce(before);
          return { detail: ok ? "visible without scrolling" : "not visible yet", value: ok };
        });

        await runStage(ctx, result, "act", async () => {
          const direction = scrollToSwipeDirection(step.direction);
          while (!found && attempts < SCROLL_UNTIL_MAX) {
            attempts += 1;
            await withDriver(ctx.session, (driver) =>
              swipe(driver, direction, ctx.session.window.w, ctx.session.window.h, 0.75)
            );
            await sleep(ctx, 600);
            const shot = await capture(ctx, index, "before", `-scroll-${attempts}`);
            found = await locateOnce(shot.png);
          }
          if (!found) {
            throw new StepFailure(
              `"${step.target}" did not become visible after ${attempts} swipes`
            );
          }
          return { detail: `found after ${attempts} swipe(s)`, value: null };
        });
        break;
      }

      case "wait": {
        skipStage(ctx, result, "locate", "no target to resolve");
        await runStage(ctx, result, "act", async () => {
          await sleep(ctx, step.seconds * 1000);
          return { detail: `waited ${step.seconds}s`, value: null };
        });
        break;
      }

      case "back": {
        skipStage(ctx, result, "locate", "no target to resolve");
        await runStage(ctx, result, "act", async () => {
          await withDriver(ctx.session, (driver) => pressBack(driver));
          return { detail: "pressed back", value: null };
        });
        break;
      }

      case "pressKey": {
        skipStage(ctx, result, "locate", "keyboard command does not need vision");
        await runStage(ctx, result, "act", async () => {
          await withDriver(ctx.session, (driver) => pressKey(driver, step.key));
          return { detail: `pressed key "${step.key}"`, value: null };
        });
        break;
      }

      case "hideKeyboard": {
        skipStage(ctx, result, "locate", "keyboard command does not need vision");
        await runStage(ctx, result, "act", async () => {
          await withDriver(ctx.session, (driver) => hideKeyboardIfShown(driver));
          return { detail: "keyboard hidden if shown", value: null };
        });
        break;
      }

      case "unlockIfNeeded": {
        resolution = await runStage(ctx, result, "locate", async () => {
          const home = await checkVisualCondition(ctx, MPC_HOME_CONDITION, before);
          if (home.result) {
            walletAlreadyUnlocked = true;
            return { detail: "wallet already unlocked", value: null };
          }

          const locked = await checkVisualCondition(ctx, MPC_LOCK_CONDITION, before);
          if (!locked.result) {
            throw new StepFailure(
              "The current MPC screen is neither the wallet Home screen nor the Welcome back PIN lock screen"
            );
          }

          if (!env.mpcPin) {
            throw new StepFailure("MPC_PIN must be set in .env.local to unlock the MPC wallet");
          }

          const pinField = await resolveTarget(
            ctx,
            index,
            "the PIN input field on the MPC Welcome back wallet lock screen",
            before,
            true
          );
          result.locate = pinField.info;
          return {
            detail: `wallet PIN field @ ${pinField.deviceX},${pinField.deviceY} (${pinField.info.source})`,
            value: pinField,
          };
        });

        await runStage(ctx, result, "act", async () => {
          if (walletAlreadyUnlocked) {
            return { detail: "wallet already unlocked", value: null };
          }

          const pin = env.mpcPin;
          if (!pin || !resolution) {
            throw new StepFailure("MPC wallet unlock prerequisites were not resolved");
          }

          try {
            await withDriver(ctx.session, async (driver) => {
              await tapAt(driver, resolution!.deviceX, resolution!.deviceY);
              await driver.pause(300);
              await clearFocusedField(driver);
              await typeText(driver, pin);
              await hideKeyboardIfShown(driver);
            });
          } catch {
            throw new StepFailure("Could not securely enter MPC_PIN into the wallet PIN field");
          }

          await sleep(ctx, 300);
          const pinEntered = await capture(ctx, index, "before", "-wallet-pin-entered");
          const unlockButton = await resolveTarget(
            ctx,
            index,
            'the "Unlock wallet" control on the MPC Welcome back screen',
            pinEntered.png,
            true
          );
          result.locate = unlockButton.info;
          await withDriver(ctx.session, (driver) =>
            tapAt(driver, unlockButton.deviceX, unlockButton.deviceY)
          );
          walletUnlockAttempted = true;
          return { detail: "submitted MPC wallet unlock", value: null };
        });
        break;
      }

      case "openApp":
      case "killApp":
      case "clearApp":
      case "minimiseApp": {
        skipStage(ctx, result, "locate", "no target to resolve");
        await runStage(ctx, result, "act", async () => {
          if (step.kind === "openApp" && step.packageName && !isAndroidPackage(step.packageName)) {
            const requested = step.packageName;
            const app = await resolveInstalledAppByName(requested);
            await withDriver(ctx.session, (driver) => activateApp(driver, app.packageName));
            return {
              detail:
                `requested="${requested}"; resolved="${app.label}"; ` +
                `package=${app.packageName}; activity=${app.activity}; launch=activated`,
              value: null,
            };
          }

          const appId = packageFor(ctx, step);
          await withDriver(ctx.session, async (driver) => {
            if (step.kind === "openApp") await activateApp(driver, appId);
            else if (step.kind === "killApp") await terminateApp(driver, appId);
            else if (step.kind === "clearApp") await clearApp(driver, appId);
            else await backgroundApp(driver);
          });
          return { detail: `${step.kind} ${appId}`, value: null };
        });
        break;
      }

      case "validate": {
        skipStage(ctx, result, "locate", "validation resolves during verify");
        skipStage(ctx, result, "act", "nothing to act on");
        break;
      }

      case "comment": {
        skipStage(ctx, result, "locate", "comment");
        skipStage(ctx, result, "act", "comment");
        break;
      }
    }

    if (step.kind === "unlockIfNeeded") {
      if (walletAlreadyUnlocked) {
        skipStage(ctx, result, "verify", "wallet already unlocked");
      } else {
        const attempts: VerifyAttempt[] = [];
        result.verify = attempts;
        await runStage(ctx, result, "verify", async () => {
          if (!walletUnlockAttempted) {
            throw new StepFailure("MPC wallet unlock was not submitted");
          }
          for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
            if (attempt > 1) await sleep(ctx, VERIFY_GAP_MS);
            const shot = await capture(ctx, index, "after", `-wallet-home-${attempt}`);
            result.afterUrl = shot.url;
            const home = await checkVisualCondition(ctx, MPC_HOME_CONDITION, shot.png);
            const entry: VerifyAttempt = {
              attempt,
              result: home.result,
              confidence: home.confidence,
              evidence: home.evidence,
              reason: home.reason,
              screenshotUrl: shot.url,
              source: home.source,
            };
            attempts.push(entry);
            ctx.bus.publish("verify", { index, attempt: entry });
            if (home.result) {
              return { detail: `MPC Home visible on attempt ${attempt}`, value: null };
            }
          }
          throw new StepFailure("MPC wallet unlock did not reach the Home screen");
        });
      }
    } else if (step.kind === "validate") {
      const attempts: VerifyAttempt[] = [];
      result.verify = attempts;
      await runStage(ctx, result, "verify", async () => {
        for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
          checkAbort(ctx);
          const shot =
            attempt === 1
              ? { png: before, url: result.beforeUrl as string }
              : await capture(ctx, index, "after", `-verify-${attempt}`);
          const prepared = await prepareImage(shot.png);
          const hash = await screenHash(prepared.buffer);

          if (ctx.localFirst) {
            const hit = await findValidate({
              appId: ctx.appId,
              description: step.condition,
              screenHash: hash,
              sentW: prepared.sentW,
              sentH: prepared.sentH,
            });
            if (hit) {
              ctx.usage.localHits += 1;
              await recordHit(hit.entry._id, ctx.runId);
              const entry: VerifyAttempt = {
                attempt,
                result: true,
                confidence: hit.entry.confidence,
                evidence: hit.entry.evidence ?? "",
                reason: "Reused from local history",
                screenshotUrl: shot.url,
                source: "local",
              };
              attempts.push(entry);
              ctx.bus.publish("verify", { index, attempt: entry });
              result.afterUrl = shot.url;
              return { detail: "passed from local history", value: null };
            }
          }

          const outcome = await validate({
            imageBase64: prepared.base64,
            sentW: prepared.sentW,
            sentH: prepared.sentH,
            condition: step.condition,
            signal: ctx.signal,
          });
          addUsage(ctx.usage, outcome.usage);

          const entry: VerifyAttempt = {
            attempt,
            result: outcome.value.result,
            confidence: outcome.value.confidence,
            evidence: outcome.value.evidence,
            reason: outcome.value.reason,
            screenshotUrl: shot.url,
            source: "vision",
          };
          attempts.push(entry);
          ctx.bus.publish("verify", { index, attempt: entry });
          result.afterUrl = shot.url;

          if (outcome.value.result) {
            if (ctx.localFirst) {
              await saveValidate({
                appId: ctx.appId,
                description: step.condition,
                screenHash: hash,
                sentW: prepared.sentW,
                sentH: prepared.sentH,
                confidence: outcome.value.confidence,
                evidence: outcome.value.evidence,
                runId: ctx.runId,
              });
            }
            return {
              detail: `true on attempt ${attempt}: ${outcome.value.evidence}`,
              value: null,
            };
          }

          if (attempt < VERIFY_ATTEMPTS) await sleep(ctx, VERIFY_GAP_MS);
        }
        const last = attempts[attempts.length - 1];
        throw new StepFailure(
          `"${step.condition}" is not true. ${last?.reason ?? ""}`.trim()
        );
      });
    } else if (step.kind !== "comment") {
      await runStage(ctx, result, "verify", async () => {
        // The expected result was already captured in the act stage, immediately
        // after the gesture. Verify that frame instead of one taken later, and
        // pass only when the expected result is actually observed.
        if (step.kind === "tap" && immediateAfter) {
          const expectation = tapExpectationFor(step.target);
          if (expectation) {
            try {
              const confirmed = await verifyTapOutcome(
                ctx,
                result,
                index,
                expectation,
                immediateAfter
              );
              return { detail: confirmed, value: null };
            } catch (error) {
              // A stale cached point taps the wrong place, so let Local First
              // learn from the miss rather than trust that entry again.
              if (resolution?.fromCache) await recordMiss(resolution.cacheId);
              throw error;
            }
          }
        }

        const isAppCommand =
          step.kind === "openApp" ||
          step.kind === "killApp" ||
          step.kind === "clearApp" ||
          step.kind === "minimiseApp";
        await sleep(ctx, isAppCommand ? APP_SETTLE_MS : SETTLE_MS);
        const shot = await capture(ctx, index, "after");
        result.afterUrl = shot.url;

        const cached = resolution?.fromCache ?? false;
        if (cached && (step.kind === "tap" || step.kind === "type")) {
          const sentPoint =
            resolution && resolution.info.x !== null && resolution.info.y !== null
              ? { x: resolution.info.x, y: resolution.info.y }
              : null;
          const typedBack =
            step.kind === "type" &&
            result.stages.act.detail.includes(`field reads "${step.text}"`);

          if (!typedBack && !(await screenChanged(before, shot.png, sentPoint))) {
            await recordMiss(resolution?.cacheId);
            const fresh = await resolveTarget(
              ctx,
              index,
              step.kind === "tap" ? step.target : (step.field as string),
              shot.png,
              false
            );
            result.locate = fresh.info;
            const moved = Math.hypot(
              fresh.deviceX - (resolution?.deviceX ?? 0),
              fresh.deviceY - (resolution?.deviceY ?? 0)
            );
            if (moved > HEAL_DISTANCE_PX) {
              await withDriver(ctx.session, async (driver) => {
                await tapAt(driver, fresh.deviceX, fresh.deviceY);
                if (step.kind === "type") {
                  await driver.pause(300);
                  await clearFocusedField(driver);
                  await typeText(driver, step.text);
                  await hideKeyboardIfShown(driver);
                }
              });
              await sleep(ctx, SETTLE_MS);
              const retry = await capture(ctx, index, "after", "-healed");
              result.afterUrl = retry.url;
              healed = true;
              return {
                detail: `local history was stale, healed to ${fresh.deviceX},${fresh.deviceY}`,
                value: null,
              };
            }
            return {
              detail: "screen did not change but vision agrees with the cached point",
              value: null,
            };
          }
        }

        return { detail: "after screenshot captured", value: null };
      });
    } else {
      skipStage(ctx, result, "verify", "comment");
    }

    result.status = healed ? "healed" : "passed";
  } catch (error) {
    if (error instanceof RunAborted) {
      result.status = "skipped";
      result.error = "stopped";
      result.latencyMs = Date.now() - startedAt;
      result.tokens = ctx.usage.inputTokens + ctx.usage.outputTokens - tokensBefore;
      ctx.bus.publish("step:end", {
        index,
        status: result.status,
        latencyMs: result.latencyMs,
        tokens: result.tokens,
        error: result.error,
      });
      throw error;
    }
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    for (const stage of Object.keys(result.stages) as StageName[]) {
      if (result.stages[stage].status === "pending") {
        result.stages[stage] = { status: "skip", ms: 0, detail: "step failed earlier" };
      }
    }
  }

  result.latencyMs = Date.now() - startedAt;
  result.tokens = ctx.usage.inputTokens + ctx.usage.outputTokens - tokensBefore;

  ctx.bus.publish("step:end", {
    index,
    status: result.status,
    latencyMs: result.latencyMs,
    tokens: result.tokens,
    error: result.error,
  });

  return result;
}
