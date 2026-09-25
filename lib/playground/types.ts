import type { SessionInfo } from "@/lib/appium/session-manager";
import type {
  AppDto,
  CacheStats,
  RunMode,
  RunStatus,
  StepResult,
  TestDto,
  Usage,
} from "@/models/types";

export type SessionStatus = "idle" | "starting" | "ready" | "stopping" | "error";

export type SessionState = {
  status: SessionStatus;
  info: SessionInfo | null;
  error: string | null;
};

export type ConnectionState = "idle" | "connecting" | "open" | "closed" | "error";

export type LogLine = {
  level: "info" | "warn" | "error";
  msg: string;
  at: string;
};

export type RunState = {
  runId: string | null;
  mode: RunMode;
  status: RunStatus | "idle";
  steps: Record<number, StepResult>;
  order: number[];
  activeStepIndex: number | null;
  usage: Usage;
  error: string | null;
  lastSeq: number;
  connection: ConnectionState;
  durationMs: number | null;
  logs: LogLine[];
  totalSteps: number;
};

export type PlaygroundState = {
  apps: AppDto[];
  appsLoaded: boolean;
  selectedAppId: string | null;
  session: SessionState;
  script: string;
  currentTest: TestDto | null;
  saved: boolean;
  tests: TestDto[];
  run: RunState;
  localFirst: boolean;
  cache: CacheStats | null;
  uploadProgress: number | null;
};

export type ParseIssue = {
  lineNo: number;
  raw: string;
  message: string;
};
