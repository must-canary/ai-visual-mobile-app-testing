import type { ObjectId } from "mongodb";
import type { StepKind } from "@/lib/dsl/types";

export type { StepKind };

export type AppDoc = {
  _id?: ObjectId;
  name: string;
  originalName: string;
  filePath: string;
  size: number;
  packageName: string;
  activity: string;
  versionName: string;
  uploadedAt: Date;
};

export type AppDto = {
  id: string;
  name: string;
  originalName: string;
  filePath: string;
  size: number;
  packageName: string;
  activity: string;
  versionName: string;
  uploadedAt: string;
};

export type TestDoc = {
  _id?: ObjectId;
  name: string;
  appId: string;
  script: string;
  createdAt: Date;
  updatedAt: Date;
  lastRunId: string | null;
};

export type TestDto = {
  id: string;
  name: string;
  appId: string;
  script: string;
  createdAt: string;
  updatedAt: string;
  lastRunId: string | null;
};

export type StageName = "capture" | "classify" | "locate" | "act" | "verify";

export type StageStatus = "pending" | "running" | "ok" | "fail" | "skip";

export type Stage = {
  status: StageStatus;
  ms: number;
  detail: string;
};

export type Stages = Record<StageName, Stage>;

export type LocateCandidate = {
  x: number;
  y: number;
  label: string;
};

export type LocateInfo = {
  found: boolean;
  x: number | null;
  y: number | null;
  matchedText: string | null;
  confidence: number;
  candidates: LocateCandidate[];
  reason: string;
  sentW: number;
  sentH: number;
  deviceX: number | null;
  deviceY: number | null;
  source: "vision" | "local";
  screenDistance: number | null;
};

export type VerifyAttempt = {
  attempt: number;
  result: boolean;
  confidence: number;
  evidence: string;
  reason: string;
  screenshotUrl: string | null;
  source: "vision" | "local";
};

export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "healed"
  | "skipped";

export type StepResult = {
  index: number;
  lineNo: number;
  raw: string;
  kind: StepKind;
  status: StepStatus;
  stages: Stages;
  beforeUrl: string | null;
  afterUrl: string | null;
  locate?: LocateInfo;
  verify?: VerifyAttempt[];
  tokens: number;
  latencyMs: number;
  error: string | null;
};

export type Usage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estCostUsd: number;
  localHits: number;
};

export type RunStatus = "queued" | "running" | "passed" | "failed" | "stopped";

export type RunMode = "full" | "step";

export type RunEventEnvelope = {
  seq: number;
  type: string;
  data: unknown;
  at: string;
};

export type RunDoc = {
  _id?: ObjectId;
  testId: string | null;
  appId: string;
  sessionId: string;
  script: string;
  mode: RunMode;
  localFirst: boolean;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  usage: Usage;
  steps: StepResult[];
  events: RunEventEnvelope[];
};

export type RunDto = {
  id: string;
  testId: string | null;
  appId: string;
  sessionId: string;
  script: string;
  mode: RunMode;
  localFirst: boolean;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  usage: Usage;
  steps: StepResult[];
  lastSeq: number;
  durationMs: number | null;
};

export type LocateCacheDoc = {
  _id?: ObjectId;
  appId: string;
  kind: "locate" | "validate";
  key: string;
  description: string;
  screenHash: string;
  patchHash: string | null;
  sentW: number;
  sentH: number;
  x: number | null;
  y: number | null;
  matchedText: string | null;
  confidence: number;
  coordinateVersion?: number;
  evidence: string | null;
  hits: number;
  misses: number;
  createdAt: Date;
  lastUsedAt: Date;
  lastRunId: string | null;
};

export type CacheStats = {
  entries: number;
  locate: number;
  validate: number;
  hits: number;
  enabledByDefault: boolean;
};

export const EMPTY_USAGE: Usage = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  estCostUsd: 0,
  localHits: 0,
};

export function emptyStages(): Stages {
  const blank: Stage = { status: "pending", ms: 0, detail: "" };
  return {
    capture: { ...blank },
    classify: { ...blank },
    locate: { ...blank },
    act: { ...blank },
    verify: { ...blank },
  };
}

export function toAppDto(doc: AppDoc): AppDto {
  return {
    id: String(doc._id),
    name: doc.name,
    originalName: doc.originalName,
    filePath: doc.filePath,
    size: doc.size,
    packageName: doc.packageName,
    activity: doc.activity,
    versionName: doc.versionName,
    uploadedAt: doc.uploadedAt.toISOString(),
  };
}

export function toTestDto(doc: TestDoc): TestDto {
  return {
    id: String(doc._id),
    name: doc.name,
    appId: doc.appId,
    script: doc.script,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    lastRunId: doc.lastRunId,
  };
}

export function toRunDto(doc: RunDoc, lastSeq: number): RunDto {
  return {
    id: String(doc._id),
    testId: doc.testId,
    appId: doc.appId,
    sessionId: doc.sessionId,
    script: doc.script,
    mode: doc.mode,
    localFirst: doc.localFirst,
    status: doc.status,
    startedAt: doc.startedAt.toISOString(),
    finishedAt: doc.finishedAt ? doc.finishedAt.toISOString() : null,
    error: doc.error,
    usage: doc.usage,
    steps: doc.steps,
    lastSeq,
    durationMs: doc.finishedAt
      ? doc.finishedAt.getTime() - doc.startedAt.getTime()
      : null,
  };
}
