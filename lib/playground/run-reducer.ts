import type {
  LocateData,
  LogData,
  RunEndData,
  RunStartData,
  ScreenshotData,
  StageData,
  StepEndData,
  StepStartData,
  VerifyData,
} from "@/lib/engine/event-types";
import {
  EMPTY_USAGE,
  emptyStages,
  type RunDto,
  type RunEventEnvelope,
  type StepResult,
} from "@/models/types";
import type { RunState } from "@/lib/playground/types";

export function emptyRun(): RunState {
  return {
    runId: null,
    mode: "full",
    status: "idle",
    steps: {},
    order: [],
    activeStepIndex: null,
    usage: { ...EMPTY_USAGE },
    error: null,
    lastSeq: 0,
    connection: "idle",
    durationMs: null,
    logs: [],
    totalSteps: 0,
  };
}

function ensureStep(
  steps: Record<number, StepResult>,
  index: number,
  seed?: Partial<StepResult>
): Record<number, StepResult> {
  const existing = steps[index];
  const base: StepResult = existing ?? {
    index,
    lineNo: seed?.lineNo ?? index,
    raw: seed?.raw ?? "",
    kind: seed?.kind ?? "tap",
    status: "pending",
    stages: emptyStages(),
    beforeUrl: null,
    afterUrl: null,
    tokens: 0,
    latencyMs: 0,
    error: null,
  };
  return { ...steps, [index]: { ...base, ...seed } };
}

export function applyRunEvent(
  state: RunState,
  envelope: RunEventEnvelope
): RunState {
  if (envelope.seq <= state.lastSeq) return state;
  const next: RunState = { ...state, lastSeq: envelope.seq };

  switch (envelope.type) {
    case "run:start": {
      const data = envelope.data as RunStartData;
      return {
        ...next,
        runId: data.runId,
        mode: data.mode,
        status: "running",
        totalSteps: data.totalSteps,
        steps: {},
        order: [],
        activeStepIndex: null,
        error: null,
        durationMs: null,
      };
    }
    case "step:start": {
      const data = envelope.data as StepStartData;
      return {
        ...next,
        steps: ensureStep(next.steps, data.index, {
          lineNo: data.lineNo,
          raw: data.raw,
          kind: data.kind,
          status: "running",
        }),
        order: next.order.includes(data.index)
          ? next.order
          : [...next.order, data.index],
        activeStepIndex: data.index,
      };
    }
    case "stage": {
      const data = envelope.data as StageData;
      const step = next.steps[data.index];
      if (!step) return next;
      const stages = { ...step.stages };
      stages[data.stage] = {
        status:
          data.status === "start"
            ? "running"
            : data.status === "ok"
              ? "ok"
              : data.status === "fail"
                ? "fail"
                : "skip",
        ms: data.ms,
        detail: data.detail,
      };
      return {
        ...next,
        steps: { ...next.steps, [data.index]: { ...step, stages } },
      };
    }
    case "screenshot": {
      const data = envelope.data as ScreenshotData;
      const step = next.steps[data.index];
      if (!step) return next;
      return {
        ...next,
        steps: {
          ...next.steps,
          [data.index]: {
            ...step,
            ...(data.phase === "before"
              ? { beforeUrl: data.url }
              : { afterUrl: data.url }),
          },
        },
      };
    }
    case "locate": {
      const data = envelope.data as LocateData;
      const step = next.steps[data.index];
      if (!step) return next;
      return {
        ...next,
        steps: { ...next.steps, [data.index]: { ...step, locate: data.result } },
      };
    }
    case "verify": {
      const data = envelope.data as VerifyData;
      const step = next.steps[data.index];
      if (!step) return next;
      const verify = [...(step.verify ?? []), data.attempt];
      return {
        ...next,
        steps: { ...next.steps, [data.index]: { ...step, verify } },
      };
    }
    case "step:end": {
      const data = envelope.data as StepEndData;
      const step = next.steps[data.index];
      if (!step) return next;
      return {
        ...next,
        steps: {
          ...next.steps,
          [data.index]: {
            ...step,
            status: data.status,
            latencyMs: data.latencyMs,
            tokens: data.tokens,
            error: data.error,
          },
        },
        activeStepIndex:
          next.activeStepIndex === data.index ? null : next.activeStepIndex,
      };
    }
    case "run:end": {
      const data = envelope.data as RunEndData;
      return {
        ...next,
        status: data.status,
        usage: data.usage,
        error: data.error,
        durationMs: data.durationMs,
        activeStepIndex: null,
        connection: "closed",
      };
    }
    case "log": {
      const data = envelope.data as LogData;
      return {
        ...next,
        logs: [...next.logs, { ...data, at: envelope.at }].slice(-200),
      };
    }
    default:
      return next;
  }
}

export function hydrateRun(dto: RunDto): RunState {
  const steps: Record<number, StepResult> = {};
  for (const step of dto.steps) steps[step.index] = step;
  return {
    runId: dto.id,
    mode: dto.mode,
    status: dto.status,
    steps,
    order: dto.steps.map((step) => step.index),
    activeStepIndex:
      dto.steps.find((step) => step.status === "running")?.index ?? null,
    usage: dto.usage,
    error: dto.error,
    lastSeq: dto.lastSeq,
    connection: "idle",
    durationMs: dto.durationMs,
    logs: [],
    totalSteps: dto.steps.length,
  };
}
