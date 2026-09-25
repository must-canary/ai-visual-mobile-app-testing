import type { Direction } from "@/lib/dsl/types";

export type AppiumDriver = {
  sessionId: string;
  execute: (script: string, ...args: unknown[]) => Promise<unknown>;
  takeScreenshot: () => Promise<string>;
  getWindowSize: () => Promise<{ width: number; height: number }>;
  deleteSession: () => Promise<void>;
  pause: (ms: number) => Promise<void>;
  keys: (value: string | string[]) => Promise<void>;
  isKeyboardShown: () => Promise<boolean>;
  hideKeyboard: () => Promise<void>;
  getActiveElement: () => Promise<Record<string, string>>;
  getElementText: (elementId: string) => Promise<string>;
  getPageSource: () => Promise<string>;
};

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

export type NativeTarget = {
  x: number;
  y: number;
  label: string;
  bounds: { left: number; top: number; right: number; bottom: number };
};

function nodesOf(pageSource: string): string[] {
  const out: string[] = [];
  let open = pageSource.indexOf("<");
  while (open >= 0) {
    const close = pageSource.indexOf(">", open);
    if (close < 0) break;
    out.push(pageSource.slice(open, close + 1));
    open = pageSource.indexOf("<", close + 1);
  }
  return out;
}

function attrOf(node: string, name: string): string {
  const key = name + '="';
  const start = node.indexOf(key);
  if (start < 0) return "";
  const from = start + key.length;
  const end = node.indexOf('"', from);
  return end < 0 ? "" : node.slice(from, end);
}

function parseBounds(value: string): NativeTarget["bounds"] | null {
  const parts = value
    .split(/[^0-9-]+/)
    .filter((part) => part.length > 0)
    .map(Number);
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [left, top, right, bottom] = parts;
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Associates the visually located target with a native accessibility element by
 * its own label, and returns that element's centre when the visual point falls
 * outside it. This corrects the coordinate only; the tap itself is unchanged.
 *
 * Generic on purpose: the label comes from what the locator matched, never from
 * a hard-coded selector. Anything ambiguous is left alone so the visual point
 * still wins.
 */
export function matchNativeTarget(
  pageSource: string,
  label: string,
  point: { x: number; y: number }
): NativeTarget | null {
  const wanted = normalizeLabel(label);
  if (wanted.length < 3) return null;

  const matches: NativeTarget[] = [];
  for (const node of nodesOf(pageSource)) {
    if (attrOf(node, "clickable") !== "true") continue;
    if (attrOf(node, "enabled") === "false") continue;
    if (attrOf(node, "displayed") === "false") continue;

    const raw = attrOf(node, "content-desc") || attrOf(node, "text");
    const candidate = normalizeLabel(raw);
    if (candidate.length < 3) continue;
    if (
      candidate !== wanted &&
      !candidate.includes(wanted) &&
      !wanted.includes(candidate)
    ) {
      continue;
    }

    const bounds = parseBounds(attrOf(node, "bounds"));
    if (!bounds) continue;
    matches.push({
      x: Math.round((bounds.left + bounds.right) / 2),
      y: Math.round((bounds.top + bounds.bottom) / 2),
      label: raw,
      bounds,
    });
  }

  // More than one equally plausible element is not worth guessing through.
  if (matches.length !== 1) return null;

  const found = matches[0];
  const alreadyOnTarget =
    point.x >= found.bounds.left &&
    point.x <= found.bounds.right &&
    point.y >= found.bounds.top &&
    point.y <= found.bounds.bottom;
  return alreadyOnTarget ? null : found;
}

/** Page source is best effort: without it the visual point is used unchanged. */
export async function resolveNativeTap(
  driver: AppiumDriver,
  point: { x: number; y: number },
  label: string | null
): Promise<NativeTarget | null> {
  if (!label) return null;
  try {
    const source = await driver.getPageSource();
    return typeof source === "string"
      ? matchNativeTarget(source, label, point)
      : null;
  } catch {
    return null;
  }
}

export async function tapAt(
  driver: AppiumDriver,
  x: number,
  y: number
): Promise<void> {
  await driver.execute("mobile: clickGesture", { x, y });
}

export async function longPressAt(driver: AppiumDriver, x: number, y: number): Promise<void> {
  await driver.execute("mobile: longClickGesture", { x, y, duration: 1000 });
}

const ANDROID_KEYCODES: Record<string, number> = {
  enter: 66,
  return: 66,
  tab: 61,
  escape: 111,
  esc: 111,
  delete: 67,
  backspace: 67,
  home: 3,
  menu: 82,
  search: 84,
  volume_up: 24,
  volume_down: 25,
  power: 26,
};

export async function pressKey(driver: AppiumDriver, key: string): Promise<void> {
  const normalized = key.trim().toLowerCase().replace(/[ -]+/g, "_");
  const keycode = ANDROID_KEYCODES[normalized];
  if (keycode !== undefined) {
    await driver.execute("mobile: pressKey", { keycode });
    return;
  }
  if (key.length === 1) {
    await driver.keys(key);
    return;
  }
  throw new Error(`Unsupported key "${key}"`);
}


export async function typeText(
  driver: AppiumDriver,
  text: string
): Promise<void> {
  try {
    await driver.execute("mobile: type", { text });
  } catch {
    await driver.keys(text);
  }
}

export async function clearFocusedField(driver: AppiumDriver): Promise<void> {
  try {
    await driver.execute("mobile: pressKey", { keycode: 29, metastate: 4096 });
    await driver.execute("mobile: pressKey", { keycode: 112 });
  } catch {
    /* field may not support select-all */
  }
}

export async function readFocusedText(
  driver: AppiumDriver
): Promise<string | null> {
  try {
    const element = await driver.getActiveElement();
    const id = element?.[ELEMENT_KEY] ?? Object.values(element ?? {})[0];
    if (!id) return null;
    return await driver.getElementText(id);
  } catch {
    return null;
  }
}

export async function hideKeyboardIfShown(driver: AppiumDriver): Promise<void> {
  try {
    if (await driver.isKeyboardShown()) {
      await driver.hideKeyboard();
    }
  } catch {
    /* keyboard state is best effort */
  }
}

export async function swipe(
  driver: AppiumDriver,
  direction: Direction,
  winW: number,
  winH: number,
  percent = 0.75
): Promise<void> {
  await driver.execute("mobile: swipeGesture", {
    left: Math.round(winW * 0.1),
    top: Math.round(winH * 0.15),
    width: Math.round(winW * 0.8),
    height: Math.round(winH * 0.7),
    direction,
    percent,
  });
}

export async function pressBack(driver: AppiumDriver): Promise<void> {
  await driver.execute("mobile: pressKey", { keycode: 4 });
}

export async function activateApp(
  driver: AppiumDriver,
  appId: string
): Promise<void> {
  await driver.execute("mobile: activateApp", { appId });
}

export async function terminateApp(
  driver: AppiumDriver,
  appId: string
): Promise<void> {
  await driver.execute("mobile: terminateApp", { appId });
}

export async function clearApp(
  driver: AppiumDriver,
  appId: string
): Promise<void> {
  await driver.execute("mobile: clearApp", { appId });
}

export async function backgroundApp(driver: AppiumDriver): Promise<void> {
  await driver.execute("mobile: backgroundApp", { seconds: -1 });
}
