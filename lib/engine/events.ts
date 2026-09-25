import { EventEmitter } from "node:events";
import type { RunEventEnvelope } from "@/models/types";
import type { RunEventType } from "@/lib/engine/event-types";

const BUFFER_LIMIT = 5000;
const RETAIN_MS = 5 * 60 * 1000;

export class RunEventBus extends EventEmitter {
  private seq = 0;
  private buffer: RunEventEnvelope[] = [];

  constructor(readonly runId: string) {
    super();
    this.setMaxListeners(64);
  }

  get lastSeq(): number {
    return this.seq;
  }

  get events(): RunEventEnvelope[] {
    return [...this.buffer];
  }

  publish(type: RunEventType, data: unknown): RunEventEnvelope {
    this.seq += 1;
    const envelope: RunEventEnvelope = {
      seq: this.seq,
      type,
      data,
      at: new Date().toISOString(),
    };
    this.buffer.push(envelope);
    if (this.buffer.length > BUFFER_LIMIT) {
      this.buffer.splice(0, this.buffer.length - BUFFER_LIMIT);
    }
    this.emit("event", envelope);
    return envelope;
  }

  since(after: number): RunEventEnvelope[] {
    if (!Number.isFinite(after) || after <= 0) return [...this.buffer];
    return this.buffer.filter((envelope) => envelope.seq > after);
  }
}

export type ActiveRun = {
  runId: string;
  sessionId: string;
  bus: RunEventBus;
  abort: AbortController;
  done: Promise<void>;
  finished: boolean;
};

type RunRegistry = {
  runs: Map<string, ActiveRun>;
  timers: Map<string, NodeJS.Timeout>;
};

const globalForRuns = globalThis as unknown as { __vmtRuns?: RunRegistry };
const registry: RunRegistry = (globalForRuns.__vmtRuns ??= {
  runs: new Map(),
  timers: new Map(),
});

export function registerRun(run: ActiveRun): void {
  registry.runs.set(run.runId, run);
}

export function getRun(runId: string): ActiveRun | undefined {
  return registry.runs.get(runId);
}

export function activeRunForSession(sessionId: string): ActiveRun | undefined {
  for (const run of registry.runs.values()) {
    if (run.sessionId === sessionId && !run.finished) return run;
  }
  return undefined;
}

export function retireRun(runId: string): void {
  const run = registry.runs.get(runId);
  if (!run) return;
  run.finished = true;
  const existing = registry.timers.get(runId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    registry.runs.delete(runId);
    registry.timers.delete(runId);
  }, RETAIN_MS);
  timer.unref?.();
  registry.timers.set(runId, timer);
}

export function formatSse(envelope: RunEventEnvelope): string {
  return `id: ${envelope.seq}\nevent: ${envelope.type}\ndata: ${JSON.stringify(
    envelope
  )}\n\n`;
}
