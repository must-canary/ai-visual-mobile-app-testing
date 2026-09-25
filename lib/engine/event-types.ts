import type {
  LocateInfo,
  RunMode,
  RunStatus,
  StageName,
  StepKind,
  StepStatus,
  Usage,
  VerifyAttempt,
} from "@/models/types";

export type RunEventType =
  | "run:start"
  | "step:start"
  | "stage"
  | "screenshot"
  | "locate"
  | "verify"
  | "step:end"
  | "run:end"
  | "log";

export type RunStartData = {
  runId: string;
  totalSteps: number;
  mode: RunMode;
  script: string;
};

export type StepStartData = {
  index: number;
  lineNo: number;
  raw: string;
  kind: StepKind;
};

export type StageData = {
  index: number;
  stage: StageName;
  status: "start" | "ok" | "fail" | "skip";
  ms: number;
  detail: string;
};

export type ScreenshotData = {
  index: number;
  phase: "before" | "after";
  url: string;
};

export type LocateData = {
  index: number;
  result: LocateInfo;
};

export type VerifyData = {
  index: number;
  attempt: VerifyAttempt;
};

export type StepEndData = {
  index: number;
  status: StepStatus;
  latencyMs: number;
  tokens: number;
  error: string | null;
};

export type RunEndData = {
  status: RunStatus;
  usage: Usage;
  error: string | null;
  durationMs: number;
};

export type LogData = {
  level: "info" | "warn" | "error";
  msg: string;
};

export const RUN_EVENT_TYPES: RunEventType[] = [
  "run:start",
  "step:start",
  "stage",
  "screenshot",
  "locate",
  "verify",
  "step:end",
  "run:end",
  "log",
];
