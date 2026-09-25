import type { TokenType } from "@/lib/playground/palette";

export type Token = {
  value: string;
  type: TokenType;
};

const RULES: Array<{ pattern: RegExp; type: TokenType }> = [
  { pattern: /^\s+/, type: "text" },
  { pattern: /^\{\{[^}]*\}\}/, type: "variable" },
  { pattern: /^"[^"]*"?/, type: "string" },
  { pattern: /^'[^']*'?/, type: "string" },
  {
    pattern: /^(?:OPEN_APP|KILL_APP|CLEAR_APP|MINIMISE_APP|MINIMIZE_APP|PRESS_DEVICE_BACK_BUTTON|UNLOCK_IF_NEEDED)\b/,
    type: "system",
  },
  { pattern: /^\d+(?:\.\d+)?%/, type: "number" },
  { pattern: /^\d+(?:\.\d+)?\b/, type: "number" },
  {
    pattern: /^(?:tap|click|press|type|validate|verify|confirm|check|uncheck|clear|select|choose|long-press|long|assert|scroll|swipe|drag|slide|wait|hide|dismiss)\b/i,
    type: "action",
  },
  { pattern: /^(?:up|down|left|right)\b/i, type: "direction" },
  {
    pattern: /^(?:on|in|into|the|until|till|untill|is|visible|that|by|for|seconds?|secs?)\b/i,
    type: "connector",
  },
  { pattern: /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+\b/, type: "package" },
  { pattern: /^[^\s]+?(?=\s|$)/, type: "text" },
  { pattern: /^[^\s]/, type: "text" },
];

export function tokenize(line: string): Token[] {
  if (line.trim().startsWith("#")) {
    return line.length > 0 ? [{ value: line, type: "comment" }] : [];
  }

  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    let matched = false;
    for (const rule of RULES) {
      const match = rest.match(rule.pattern);
      if (match && match[0].length > 0) {
        tokens.push({ value: match[0], type: rule.type });
        rest = rest.slice(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ value: rest[0], type: "text" });
      rest = rest.slice(1);
    }
  }

  return mergeAdjacent(tokens);
}

function mergeAdjacent(tokens: Token[]): Token[] {
  const merged: Token[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type && token.type === "text") {
      last.value += token.value;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}

export function reconstruct(tokens: Token[]): string {
  return tokens.map((token) => token.value).join("");
}
