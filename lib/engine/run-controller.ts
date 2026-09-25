import { ObjectId } from "mongodb";
import { runs, tests } from "@/lib/mongodb";
import type { LiveSession } from "@/lib/appium/session-manager";
import type { Step } from "@/lib/dsl/types";
import {
  RunEventBus,
  activeRunForSession,
  registerRun,
  retireRun,
} from "@/lib/engine/events";
import { RunAborted, executeStep, type StepContext } from "@/lib/engine/step-executor";
import {
  EMPTY_USAGE,
  emptyStages,
  type RunDoc,
  type RunMode,
  type RunStatus,
  type StepResult,
  type Usage,
} from "@/models/types";

export class RunConflict extends Error {}

export type StartRunInput = {
  session: LiveSession;
  script: string;
  steps: Step[];
  testId: string | null;
  mode: RunMode;
  localFirst: boolean;
};

function pendingStep(step: Step, index: number): StepResult {
  return {
    index,
    lineNo: step.lineNo,
    raw: step.raw,
    kind: step.kind,
    status: "pending",
    stages: emptyStages(),
    beforeUrl: null,
    afterUrl: null,
    tokens: 0,
    latencyMs: 0,
    error: null,
  };
}

export async function startRun(input: StartRunInput): Promise<string> {
  const existing = activeRunForSession(input.session.id);
  if (existing) {
    throw new RunConflict("A run is already active on this session");
  }

  const collection = await runs();
  const usage: Usage = { ...EMPTY_USAGE };
  const steps = input.steps.map(pendingStep);

  const doc: RunDoc = {
    testId: input.testId,
    appId: input.session.appId,
    sessionId: input.session.id,
    script: input.script,
    mode: input.mode,
    localFirst: input.localFirst,
    status: "running",
    startedAt: new Date(),
    finishedAt: null,
    error: null,
    usage,
    steps,
    events: [],
  };

  const inserted = await collection.insertOne(doc);
  const runId = String(inserted.insertedId);

  const bus = new RunEventBus(runId);
  const abort = new AbortController();

  const ctx: StepContext = {
    runId,
    session: input.session,
    bus,
    signal: abort.signal,
    usage,
    localFirst: input.localFirst,
    appId: input.session.appId,
  };

  const done = (async () => {
    let status: RunStatus = "running";
    let error: string | null = null;

    bus.publish("run:start", {
      runId,
      totalSteps: steps.length,
      mode: input.mode,
      script: input.script,
    });

    try {
      for (let index = 0; index < input.steps.length; index += 1) {
        if (abort.signal.aborted) {
          status = "stopped";
          break;
        }
        try {
          steps[index] = await executeStep(ctx, input.steps[index], index);
        } catch (stepError) {
          if (stepError instanceof RunAborted) {
            status = "stopped";
            break;
          }
          throw stepError;
        }

        await collection.updateOne(
          { _id: inserted.insertedId },
          { $set: { steps, usage } }
        );

        if (steps[index].status === "failed") {
          status = "failed";
          error = steps[index].error;
          break;
        }
      }

      if (status === "running") status = "passed";
    } catch (runError) {
      status = "failed";
      error = runError instanceof Error ? runError.message : String(runError);
      bus.publish("log", { level: "error", msg: error });
    }

    for (const step of steps) {
      if (step.status === "pending" || step.status === "running") {
        step.status = "skipped";
      }
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - doc.startedAt.getTime();

    bus.publish("run:end", { status, usage, error, durationMs });

    await collection.updateOne(
      { _id: inserted.insertedId },
      {
        $set: {
          status,
          error,
          usage,
          steps,
          finishedAt,
          events: bus.events,
        },
      }
    );

    if (input.testId) {
      const testsCollection = await tests();
      await testsCollection
        .updateOne({ _id: new ObjectId(input.testId) }, { $set: { lastRunId: runId } })
        .catch(() => undefined);
    }

    input.session.activeRunId = null;
    retireRun(runId);
  })();

  registerRun({
    runId,
    sessionId: input.session.id,
    bus,
    abort,
    done,
    finished: false,
  });
  input.session.activeRunId = runId;

  void done.catch(() => undefined);

  return runId;
}
