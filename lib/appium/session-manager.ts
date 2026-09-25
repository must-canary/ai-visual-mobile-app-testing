import crypto from "node:crypto";
import { remote } from "webdriverio";
import { env } from "@/lib/env";
import { readyDevices } from "@/lib/android/sdk";
import type { AppiumDriver } from "@/lib/appium/gestures";
import { imageSize, toMirrorJpeg } from "@/lib/appium/screenshot";

export type ResetMode = "none" | "clear" | "reinstall";

export type LiveSession = {
  id: string;
  appId: string;
  packageName: string;
  activity: string;
  driver: AppiumDriver;
  window: { w: number; h: number };
  shotSize: { w: number; h: number };
  scale: number;
  queue: Promise<unknown>;
  frameSeq: number;
  lastFrame: { jpeg: Buffer; at: number; source: "live" | "run" } | null;
  activeRunId: string | null;
  startedAt: Date;
  lastUsedAt: Date;
};

export type SessionInfo = {
  sessionId: string;
  appId: string;
  packageName: string;
  activity: string;
  window: { w: number; h: number };
  screenshot: { w: number; h: number };
  scale: number;
  activeRunId: string | null;
  startedAt: string;
};

export class SessionError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SessionError";
  }
}

type SessionGlobal = {
  sessions: Map<string, LiveSession>;
  reaper?: NodeJS.Timeout;
};

const globalForSessions = globalThis as unknown as {
  __vmtSessions?: SessionGlobal;
};

const store: SessionGlobal = (globalForSessions.__vmtSessions ??= {
  sessions: new Map(),
});

const IDLE_MS = 15 * 60 * 1000;
const FRAME_TTL_MS = 400;

function startReaper(): void {
  if (store.reaper) return;
  store.reaper = setInterval(() => {
    const now = Date.now();
    for (const session of [...store.sessions.values()]) {
      if (session.activeRunId) continue;
      if (now - session.lastUsedAt.getTime() > IDLE_MS) {
        void stopSession(session.id);
      }
    }
  }, 60_000);
  store.reaper.unref?.();
}

function appiumEndpoint(): { hostname: string; port: number; protocol: string } {
  const url = new URL(env.appiumUrl);
  return {
    hostname: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol.replace(":", ""),
  };
}

async function assertAppiumReady(): Promise<void> {
  try {
    const res = await fetch(`${env.appiumUrl.replace(/\/$/, "")}/status`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SessionError(
      `Appium is not reachable at ${env.appiumUrl} (${detail}). Start it with: appium --base-path /`,
      503
    );
  }
}

async function assertDeviceReady(): Promise<string> {
  let devices;
  try {
    devices = await readyDevices();
  } catch (error) {
    throw new SessionError(
      error instanceof Error ? error.message : String(error),
      503
    );
  }
  if (devices.length === 0) {
    throw new SessionError(
      "No Android device is ready. Boot an emulator and check `adb devices`.",
      503
    );
  }
  const wanted = env.androidUdid;
  if (wanted && devices.some((d) => d.udid === wanted)) return wanted;
  return devices[0].udid;
}

async function dropOrphanSessions(): Promise<void> {
  const base = env.appiumUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/appium/sessions`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { value?: Array<{ id?: string }> };
    for (const item of body.value ?? []) {
      if (!item.id) continue;
      await fetch(`${base}/session/${item.id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8000),
      }).catch(() => undefined);
    }
  } catch {
    /* session discovery is optional in Appium 3 */
  }
}

export function withDriver<T>(
  session: LiveSession,
  fn: (driver: AppiumDriver) => Promise<T>
): Promise<T> {
  const next = session.queue.then(() => fn(session.driver));
  session.queue = next.then(
    () => undefined,
    () => undefined
  );
  session.lastUsedAt = new Date();
  return next;
}

export type StartSessionInput = {
  appId: string;
  apkAbsolutePath: string;
  packageName: string;
  activity: string;
  reset: ResetMode;
};

export async function startSession(
  input: StartSessionInput
): Promise<LiveSession> {
  await assertAppiumReady();
  const udid = await assertDeviceReady();

  for (const existing of [...store.sessions.values()]) {
    await stopSession(existing.id);
  }
  await dropOrphanSessions();

  const endpoint = appiumEndpoint();
  let driver: AppiumDriver;
  try {
    driver = (await remote({
      hostname: endpoint.hostname,
      port: endpoint.port,
      protocol: endpoint.protocol,
      path: "/",
      logLevel: "error",
      connectionRetryTimeout: 180000,
      capabilities: {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:udid": udid,
        "appium:deviceName": udid,
        "appium:app": input.apkAbsolutePath,
        "appium:appPackage": input.packageName,
        "appium:appActivity": input.activity,
        "appium:noReset": input.reset === "none",
        "appium:fullReset": input.reset === "reinstall",
        "appium:newCommandTimeout": 0,
        "appium:autoGrantPermissions": true,
        "appium:androidInstallTimeout": 300000,
        "appium:uiautomator2ServerInstallTimeout": 120000,
      },
    })) as unknown as AppiumDriver;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SessionError(`Appium could not start a session: ${detail}`, 502);
  }

  try {
    const window = await driver.getWindowSize();
    const png = Buffer.from(await driver.takeScreenshot(), "base64");
    const shot = await imageSize(png);
    const session: LiveSession = {
      id: crypto.randomUUID(),
      appId: input.appId,
      packageName: input.packageName,
      activity: input.activity,
      driver,
      window: { w: window.width, h: window.height },
      shotSize: { w: shot.width, h: shot.height },
      scale: shot.width / window.width,
      queue: Promise.resolve(),
      frameSeq: 1,
      lastFrame: { jpeg: await toMirrorJpeg(png), at: Date.now(), source: "live" },
      activeRunId: null,
      startedAt: new Date(),
      lastUsedAt: new Date(),
    };
    store.sessions.set(session.id, session);
    startReaper();
    return session;
  } catch (error) {
    await driver.deleteSession().catch(() => undefined);
    const detail = error instanceof Error ? error.message : String(error);
    throw new SessionError(`Session started but the device did not respond: ${detail}`, 502);
  }
}

export function getSession(id: string): LiveSession | undefined {
  return store.sessions.get(id);
}

export function listSessions(): LiveSession[] {
  return [...store.sessions.values()];
}

export function requireSession(id: string): LiveSession {
  const session = store.sessions.get(id);
  if (!session) throw new SessionError("Session not found", 404);
  return session;
}

export async function stopSession(id: string): Promise<boolean> {
  const session = store.sessions.get(id);
  if (!session) return false;
  store.sessions.delete(id);
  try {
    await session.driver.deleteSession();
  } catch {
    /* the session may already be gone */
  }
  return true;
}

export function sessionInfo(session: LiveSession): SessionInfo {
  return {
    sessionId: session.id,
    appId: session.appId,
    packageName: session.packageName,
    activity: session.activity,
    window: session.window,
    screenshot: { w: session.shotSize.w, h: session.shotSize.h },
    scale: session.scale,
    activeRunId: session.activeRunId,
    startedAt: session.startedAt.toISOString(),
  };
}

export async function updateFrame(
  session: LiveSession,
  png: Buffer,
  source: "live" | "run"
): Promise<void> {
  const jpeg = await toMirrorJpeg(png);
  const unchanged = session.lastFrame?.jpeg.equals(jpeg) ?? false;
  session.lastFrame = { jpeg, at: Date.now(), source };
  if (!unchanged) session.frameSeq += 1;
}

export async function getFrame(
  session: LiveSession
): Promise<{ jpeg: Buffer; seq: number; source: "live" | "run" }> {
  const cached = session.lastFrame;
  const fresh = cached && Date.now() - cached.at < FRAME_TTL_MS;
  if (cached && (session.activeRunId || fresh)) {
    return { jpeg: cached.jpeg, seq: session.frameSeq, source: cached.source };
  }
  const png = Buffer.from(
    await withDriver(session, (driver) => driver.takeScreenshot()),
    "base64"
  );
  await updateFrame(session, png, "live");
  return {
    jpeg: session.lastFrame!.jpeg,
    seq: session.frameSeq,
    source: "live",
  };
}

export async function captureScreenshot(session: LiveSession): Promise<Buffer> {
  return Buffer.from(
    await withDriver(session, (driver) => driver.takeScreenshot()),
    "base64"
  );
}
