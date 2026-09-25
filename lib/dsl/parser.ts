import { COMMAND_SPECS } from "@/lib/dsl/commands";
import type { ParseError, ParseResult, Step } from "@/lib/dsl/types";

const HINTS: Array<{ test: RegExp; hint: string }> = [
  {
    test: /^(open_app|kill_app|clear_app|minimi[sz]e_app|press_device_back_button|unlock_if_needed)/i,
    hint: "System commands must be uppercase",
  },
  {
    test: /^(scroll|swipe|drag|slide)\b/i,
    hint: 'Try "Scroll down" or \'Scroll down until "Total" is visible\'',
  },
  { test: /^wait\b/i, hint: 'Try "Wait Until 2 Seconds" or \'Wait Until "Save" is visible\'' },
  { test: /^(?:long\s+press|long-press|press\s+and\s+hold)\b/i, hint: 'Try "Long Press on <description>"' },
  { test: /^(?:select|choose)\b/i, hint: 'Try \'Select "<option>" from <description>\'' },
  { test: /^press\b/i, hint: 'Use \'Press "<key>"\' for a key, or "Press <description>" for an element' },
  { test: /\/\/|\bxpath\b|\bid=|\bcss\b/i, hint: "Selectors are not supported, describe the element in plain English" },
];

function hintFor(line: string): string {
  for (const { test, hint } of HINTS) {
    if (test.test(line)) return hint;
  }
  return 'Unknown step. Try "Tap on <description>", \'Type "text" in <field>\' or "Validate that <condition>"';
}

export function parseLine(line: string, lineNo: number): Step | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  for (const spec of COMMAND_SPECS) {
    for (const pattern of spec.patterns) {
      const match = trimmed.match(pattern);
      if (match) return spec.build(match, lineNo, trimmed);
    }
  }
  return null;
}

export function parseScript(script: string): ParseResult {
  const steps: Step[] = [];
  const errors: ParseError[] = [];
  const lines = script.replace(/\r\n/g, "\n").split("\n");

  lines.forEach((line, lineNo) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    const step = parseLine(line, lineNo);
    if (step) {
      steps.push(step);
      return;
    }
    errors.push({ lineNo, raw: trimmed, message: hintFor(trimmed) });
  });

  return { steps, errors };
}

export function executableSteps(steps: Step[]): Step[] {
  return steps.filter((step) => step.kind !== "comment");
}
