import type { Direction, Step } from "@/lib/dsl/types";

export type CommandSpec = {
  kind: string;
  label: string;
  usage: string;
  description: string;
  snippet: string;
  caretOffset: number;
  patterns: RegExp[];
  build: (match: RegExpMatchArray, lineNo: number, raw: string) => Step;
};

function dir(value: string): Direction {
  return value.toLowerCase() as Direction;
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.;]+$/, "");
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"([\s\S]*)"$/) ?? trimmed.match(/^'([\s\S]*)'$/);
  return quoted ? quoted[1] : trimmed;
}

export const COMMAND_SPECS: CommandSpec[] = [
  {
    kind: "comment",
    label: "#",
    usage: "# note",
    description: "Comment line, never executed",
    snippet: "# ",
    caretOffset: 2,
    patterns: [/^#(.*)$/],
    build: (m, lineNo, raw) => ({
      kind: "comment",
      lineNo,
      raw,
      text: m[1].trim(),
    }),
  },
  {
    kind: "back",
    label: "PRESS_DEVICE_BACK_BUTTON",
    usage: "PRESS_DEVICE_BACK_BUTTON",
    description: "Press the Android back button",
    snippet: "PRESS_DEVICE_BACK_BUTTON",
    caretOffset: 24,
    patterns: [/^PRESS_DEVICE_BACK_BUTTON$/],
    build: (_m, lineNo, raw) => ({ kind: "back", lineNo, raw }),
  },
  {
    kind: "unlockIfNeeded",
    label: "UNLOCK_IF_NEEDED",
    usage: "UNLOCK_IF_NEEDED",
    description: "Unlock the device only when it is locked",
    snippet: "UNLOCK_IF_NEEDED",
    caretOffset: 16,
    patterns: [/^UNLOCK_IF_NEEDED$/],
    build: (_m, lineNo, raw) => ({ kind: "unlockIfNeeded", lineNo, raw }),
  },
  {
    kind: "hideKeyboard",
    label: "Hide Keyboard",
    usage: "Hide Keyboard",
    description: "Hide the software keyboard when it is shown",
    snippet: "Hide Keyboard",
    caretOffset: 13,
    patterns: [/^hide\s+(?:the\s+)?keyboard$/i, /^dismiss\s+(?:the\s+)?keyboard$/i],
    build: (_m, lineNo, raw) => ({ kind: "hideKeyboard", lineNo, raw }),
  },
  {
    kind: "pressKey",
    label: "Press key",
    usage: 'Press "<key>"',
    description: "Press a keyboard or Android system key",
    snippet: 'Press ""',
    caretOffset: 7,
    patterns: [/^press\s+"([^"\r\n]+)"$/i, /^press\s+'([^'\r\n]+)'$/i],
    build: (m, lineNo, raw) => ({ kind: "pressKey", lineNo, raw, key: clean(m[1]) }),
  },
  {
    kind: "openApp",
    label: "OPEN_APP",
    usage: "OPEN_APP [package|app name]",
    description: "Launch the app under test, a package, or an installed app by label",
    snippet: "OPEN_APP",
    caretOffset: 8,
    patterns: [/^OPEN_APP(?:\s+(.+\S|\S))?$/],
    build: (m, lineNo, raw) => ({
      kind: "openApp",
      lineNo,
      raw,
      packageName: m[1] ? clean(unquote(m[1])) : null,
    }),
  },
  {
    kind: "killApp",
    label: "KILL_APP",
    usage: "KILL_APP [package]",
    description: "Terminate the app under test, or a named package",
    snippet: "KILL_APP",
    caretOffset: 8,
    patterns: [/^KILL_APP(?:\s+([A-Za-z0-9_][A-Za-z0-9_.]*))?$/],
    build: (m, lineNo, raw) => ({
      kind: "killApp",
      lineNo,
      raw,
      packageName: m[1] ?? null,
    }),
  },
  {
    kind: "clearApp",
    label: "CLEAR_APP",
    usage: "CLEAR_APP [package]",
    description: "Clear app data and stop it",
    snippet: "CLEAR_APP",
    caretOffset: 9,
    patterns: [/^CLEAR_APP(?:\s+([A-Za-z0-9_][A-Za-z0-9_.]*))?$/],
    build: (m, lineNo, raw) => ({
      kind: "clearApp",
      lineNo,
      raw,
      packageName: m[1] ?? null,
    }),
  },
  {
    kind: "minimiseApp",
    label: "MINIMISE_APP",
    usage: "MINIMISE_APP [package]",
    description: "Send the app to the background",
    snippet: "MINIMISE_APP",
    caretOffset: 12,
    patterns: [/^MINIMI[SZ]E_APP(?:\s+([A-Za-z0-9_][A-Za-z0-9_.]*))?$/],
    build: (m, lineNo, raw) => ({
      kind: "minimiseApp",
      lineNo,
      raw,
      packageName: m[1] ?? null,
    }),
  },
  {
    kind: "wait",
    label: "Wait Until",
    usage: 'Wait Until <n> Seconds',
    description: "Pause for a number of seconds",
    snippet: "Wait Until 2 Seconds",
    caretOffset: 11,
    patterns: [
      /^wait\s+until\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?$/i,
      /^wait\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "wait",
      lineNo,
      raw,
      seconds: Number(m[1]),
    }),
  },
  {
    kind: "waitVisible",
    label: "Wait Until visible",
    usage: 'Wait Until "<description>" is visible',
    description: "Wait for an element described in plain English",
    snippet: 'Wait Until "" is visible',
    caretOffset: 12,
    patterns: [
      /^wait\s+until\s+"([^"\r\n]+)"\s+is\s+visible$/i,
      /^wait\s+until\s+'([^'\r\n]+)'\s+is\s+visible$/i,
    ],
    build: (m, lineNo, raw) => ({ kind: "waitVisible", lineNo, raw, target: clean(m[1]) }),
  },
  {
    kind: "scrollUntil",
    label: "Scroll until",
    usage: 'Scroll <up|down|left|right> until "<target>" is visible',
    description: "Swipe repeatedly until something comes into view",
    snippet: 'Scroll down until "" is visible',
    caretOffset: 20,
    patterns: [
      /^(?:scroll|swipe|drag|slide)\s+(up|down|left|right)\s+(?:until|till|untill)\s+(.+?)\s+is\s+visible$/i,
      /^(?:scroll|swipe|drag|slide)\s+(up|down|left|right)\s+(?:until|till|untill)\s+(?:i\s+see\s+)?(.+)$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "scrollUntil",
      lineNo,
      raw,
      direction: dir(m[1]),
      target: clean(unquote(m[2])),
    }),
  },
  {
    kind: "scroll",
    label: "Scroll",
    usage: "Scroll <up|down|left|right> [by <n>%]",
    description: "Swipe the screen in a direction",
    snippet: "Scroll down",
    caretOffset: 11,
    patterns: [
      /^(?:scroll|swipe|drag|slide)\s+(up|down|left|right)\s+by\s+(\d+)\s*%$/i,
      /^(?:scroll|swipe|drag|slide)\s+(up|down|left|right)$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "scroll",
      lineNo,
      raw,
      direction: dir(m[1]),
      percent: m[2] ? Number(m[2]) / 100 : 0.75,
    }),
  },
  {
    kind: "validate",
    label: "Validate that",
    usage: "Validate that <condition>",
    description: "Check a condition against what is on screen",
    snippet: "Validate that ",
    caretOffset: 14,
    patterns: [
      /^(?:(?:validate|verify|confirm|assert)\s+(?:that\s+)?|check\s+that\s+)(.+)$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "validate",
      lineNo,
      raw,
      condition: clean(m[1]),
    }),
  },
  {
    kind: "select",
    label: "Select",
    usage: 'Select "<option>" from <description>',
    description: "Open a described selector and choose an option",
    snippet: 'Select "" from ',
    caretOffset: 8,
    patterns: [
      /^select\s+"([^"\r\n]+)"\s+from\s+(?:the\s+)?(.+)$/i,
      /^select\s+'([^'\r\n]+)'\s+from\s+(?:the\s+)?(.+)$/i,
      /^choose\s+"([^"\r\n]+)"\s+from\s+(?:the\s+)?(.+)$/i,
      /^choose\s+'([^'\r\n]+)'\s+from\s+(?:the\s+)?(.+)$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "select",
      lineNo,
      raw,
      option: clean(m[1]),
      target: clean(unquote(m[2])),
    }),
  },
  {
    kind: "longPress",
    label: "Long Press on",
    usage: "Long Press on <description>",
    description: "Long-press an element described in plain English",
    snippet: "Long Press on ",
    caretOffset: 14,
    patterns: [/^(?:long\s+press|long-press|press\s+and\s+hold)\s+(?:on\s+)?(?:the\s+)?(.+)$/i],
    build: (m, lineNo, raw) => ({ kind: "longPress", lineNo, raw, target: clean(unquote(m[1])) }),
  },
  ...(["check", "uncheck", "clear"] as const).map((kind): CommandSpec => ({
    kind,
    label: `${kind[0].toUpperCase()}${kind.slice(1)}`,
    usage: `${kind[0].toUpperCase()}${kind.slice(1)} <description>`,
    description: `${kind[0].toUpperCase()}${kind.slice(1)} an element described in plain English`,
    snippet: `${kind[0].toUpperCase()}${kind.slice(1)} `,
    caretOffset: kind.length + 1,
    patterns: [new RegExp(`^${kind}\\s+(?:the\\s+)?(.+)$`, "i")],
    build: (m, lineNo, raw) => ({ kind, lineNo, raw, target: clean(unquote(m[1])) }),
  })),
  {
    kind: "type",
    label: "Type",
    usage: 'Type "<text>" in <field>',
    description: "Type text into a field described in plain English",
    snippet: 'Type "" in ',
    caretOffset: 6,
    patterns: [
      /^type\s+"([\s\S]*?)"\s+(?:in|into|on)\s+(?:the\s+)?(.+)$/i,
      /^type\s+'([\s\S]*?)'\s+(?:in|into|on)\s+(?:the\s+)?(.+)$/i,
      /^type\s+(.+?)\s+(?:in|into|on)\s+(?:the\s+)?(.+)$/i,
      /^type\s+"([\s\S]*)"$/i,
      /^type\s+'([\s\S]*)'$/i,
      /^type\s+(.+)$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "type",
      lineNo,
      raw,
      text: m[1],
      field: m[2] ? clean(m[2]) : null,
    }),
  },
  {
    kind: "tap",
    label: "Tap on",
    usage: "Tap on <description>",
    description: "Tap an element described in plain English",
    snippet: "Tap on ",
    caretOffset: 7,
    patterns: [
      /^(?:tap|click)\s+(?:on\s+)?(?:the\s+)?(.+)$/i,
      /^press\s+(?!["'])(?:on\s+)?(?:the\s+)?(.+)$/i,
    ],
    build: (m, lineNo, raw) => ({
      kind: "tap",
      lineNo,
      raw,
      target: clean(unquote(m[1])),
    }),
  },
];

export const COMMAND_LABELS = COMMAND_SPECS.filter(
  (spec) => spec.kind !== "comment"
).map((spec) => ({
  kind: spec.kind,
  label: spec.label,
  usage: spec.usage,
  description: spec.description,
  snippet: spec.snippet,
  caretOffset: spec.caretOffset,
}));
