export type Direction = "up" | "down" | "left" | "right";

export type StepKind =
  | "comment"
  | "tap"
  | "type"
  | "validate"
  | "scroll"
  | "scrollUntil"
  | "wait"
  | "waitVisible"
  | "longPress"
  | "select"
  | "check"
  | "uncheck"
  | "clear"
  | "pressKey"
  | "hideKeyboard"
  | "unlockIfNeeded"
  | "openApp"
  | "killApp"
  | "clearApp"
  | "minimiseApp"
  | "back";

type Base = {
  lineNo: number;
  raw: string;
};

export type CommentStep = Base & { kind: "comment"; text: string };
export type TapStep = Base & { kind: "tap"; target: string };
export type TypeStep = Base & {
  kind: "type";
  text: string;
  field: string | null;
};
export type ValidateStep = Base & { kind: "validate"; condition: string };
export type ScrollStep = Base & {
  kind: "scroll";
  direction: Direction;
  percent: number;
};
export type ScrollUntilStep = Base & {
  kind: "scrollUntil";
  direction: Direction;
  target: string;
};
export type WaitStep = Base & { kind: "wait"; seconds: number };
export type WaitVisibleStep = Base & { kind: "waitVisible"; target: string };
export type TargetStep = Base & {
  kind: "longPress" | "check" | "uncheck" | "clear";
  target: string;
};
export type SelectStep = Base & { kind: "select"; option: string; target: string };
export type PressKeyStep = Base & { kind: "pressKey"; key: string };
export type HideKeyboardStep = Base & { kind: "hideKeyboard" };
export type UnlockIfNeededStep = Base & { kind: "unlockIfNeeded" };
export type AppStep = Base & {
  kind: "openApp" | "killApp" | "clearApp" | "minimiseApp";
  packageName: string | null;
};
export type BackStep = Base & { kind: "back" };

export type Step =
  | CommentStep
  | TapStep
  | TypeStep
  | ValidateStep
  | ScrollStep
  | ScrollUntilStep
  | WaitStep
  | WaitVisibleStep
  | TargetStep
  | SelectStep
  | PressKeyStep
  | HideKeyboardStep
  | UnlockIfNeededStep
  | AppStep
  | BackStep;

export type ParseError = {
  lineNo: number;
  raw: string;
  message: string;
};

export type ParseResult = {
  steps: Step[];
  errors: ParseError[];
};

export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as string[]).includes(value.toLowerCase());
}
