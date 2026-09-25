export type TokenType =
  | "action"
  | "system"
  | "string"
  | "number"
  | "direction"
  | "connector"
  | "package"
  | "comment"
  | "variable"
  | "text";

export const TOKEN_CLASS: Record<TokenType, string> = {
  action: "font-bold text-violet-600 dark:text-violet-400",
  system: "font-bold text-fuchsia-600 dark:text-fuchsia-400",
  string: "text-emerald-600 dark:text-emerald-400",
  number: "text-amber-600 dark:text-amber-400",
  direction: "text-sky-600 dark:text-sky-400",
  connector: "text-neutral-400 dark:text-neutral-500",
  package: "text-teal-600 dark:text-teal-400",
  comment: "italic text-neutral-400 dark:text-neutral-500",
  variable: "text-orange-600 dark:text-orange-400",
  text: "text-neutral-800 dark:text-neutral-200",
};

export const STATUS_CLASS: Record<string, string> = {
  passed: "bg-emerald-500",
  failed: "bg-red-500",
  healed: "bg-amber-500",
  skipped: "bg-neutral-400",
  running: "bg-sky-500 animate-pulse",
  pending: "bg-neutral-300 dark:bg-neutral-700",
};
