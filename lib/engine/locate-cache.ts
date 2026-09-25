import { ObjectId } from "mongodb";
import { env } from "@/lib/env";
import { locateCache } from "@/lib/mongodb";
import { hamming, patchHash } from "@/lib/vision/phash";
import type { CacheStats, LocateCacheDoc } from "@/models/types";

export const PATCH_SIZE = 64;
export const COORDINATE_PIPELINE_VERSION = 2;

export function cacheKey(kind: "locate" | "validate", description: string): string {
  return `${kind}:${description.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export type CacheHit = {
  entry: LocateCacheDoc;
  screenDistance: number;
};

export async function findLocate(input: {
  appId: string;
  description: string;
  sentPng: Buffer;
  screenHash: string;
  sentW: number;
  sentH: number;
}): Promise<CacheHit | null> {
  const collection = await locateCache();
  const entries = await collection
    .find({
      appId: input.appId,
      kind: "locate",
      key: cacheKey("locate", input.description),
      coordinateVersion: COORDINATE_PIPELINE_VERSION,
      sentW: input.sentW,
      sentH: input.sentH,
    })
    .sort({ lastUsedAt: -1 })
    .limit(10)
    .toArray();

  let best: CacheHit | null = null;

  for (const entry of entries) {
    if (entry.x === null || entry.y === null) continue;
    const screenDistance = hamming(entry.screenHash, input.screenHash);
    if (screenDistance > env.localFirstScreenDistance) continue;
    if (entry.patchHash) {
      const current = await patchHash(input.sentPng, entry.x, entry.y, PATCH_SIZE);
      if (hamming(entry.patchHash, current) > env.localFirstPatchDistance) continue;
    }
    if (!best || screenDistance < best.screenDistance) {
      best = { entry, screenDistance };
    }
  }

  return best;
}

export async function saveLocate(input: {
  appId: string;
  description: string;
  sentPng: Buffer;
  screenHash: string;
  sentW: number;
  sentH: number;
  x: number;
  y: number;
  matchedText: string | null;
  confidence: number;
  runId: string;
}): Promise<void> {
  const collection = await locateCache();
  const key = cacheKey("locate", input.description);
  const hash = await patchHash(input.sentPng, input.x, input.y, PATCH_SIZE);
  const now = new Date();

  await collection.deleteMany({
    appId: input.appId,
    kind: "locate",
    key,
    screenHash: input.screenHash,
  });

  await collection.insertOne({
    appId: input.appId,
    kind: "locate",
    key,
    description: input.description,
    screenHash: input.screenHash,
    patchHash: hash,
    sentW: input.sentW,
    sentH: input.sentH,
    x: input.x,
    y: input.y,
    matchedText: input.matchedText,
    confidence: input.confidence,
    coordinateVersion: COORDINATE_PIPELINE_VERSION,
    evidence: null,
    hits: 0,
    misses: 0,
    createdAt: now,
    lastUsedAt: now,
    lastRunId: input.runId,
  });
}

export async function findValidate(input: {
  appId: string;
  description: string;
  screenHash: string;
  sentW: number;
  sentH: number;
}): Promise<CacheHit | null> {
  const collection = await locateCache();
  const entries = await collection
    .find({
      appId: input.appId,
      kind: "validate",
      key: cacheKey("validate", input.description),
      sentW: input.sentW,
      sentH: input.sentH,
    })
    .sort({ lastUsedAt: -1 })
    .limit(10)
    .toArray();

  let best: CacheHit | null = null;
  for (const entry of entries) {
    const screenDistance = hamming(entry.screenHash, input.screenHash);
    if (screenDistance > env.localFirstValidateDistance) continue;
    if (!best || screenDistance < best.screenDistance) {
      best = { entry, screenDistance };
    }
  }
  return best;
}

export async function saveValidate(input: {
  appId: string;
  description: string;
  screenHash: string;
  sentW: number;
  sentH: number;
  confidence: number;
  evidence: string;
  runId: string;
}): Promise<void> {
  const collection = await locateCache();
  const key = cacheKey("validate", input.description);
  const now = new Date();

  await collection.deleteMany({
    appId: input.appId,
    kind: "validate",
    key,
    screenHash: input.screenHash,
  });

  await collection.insertOne({
    appId: input.appId,
    kind: "validate",
    key,
    description: input.description,
    screenHash: input.screenHash,
    patchHash: null,
    sentW: input.sentW,
    sentH: input.sentH,
    x: null,
    y: null,
    matchedText: null,
    confidence: input.confidence,
    evidence: input.evidence,
    hits: 0,
    misses: 0,
    createdAt: now,
    lastUsedAt: now,
    lastRunId: input.runId,
  });
}

export async function recordHit(id: ObjectId | undefined, runId: string): Promise<void> {
  if (!id) return;
  const collection = await locateCache();
  await collection.updateOne(
    { _id: new ObjectId(id) },
    { $inc: { hits: 1 }, $set: { lastUsedAt: new Date(), lastRunId: runId } }
  );
}

export async function recordMiss(id: ObjectId | undefined): Promise<void> {
  if (!id) return;
  const collection = await locateCache();
  const updated = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $inc: { misses: 1 } },
    { returnDocument: "after" }
  );
  if (updated && updated.misses >= env.localFirstMaxMisses) {
    await collection.deleteOne({ _id: updated._id });
  }
}

export async function cacheStats(appId?: string): Promise<CacheStats> {
  const collection = await locateCache();
  const filter = appId ? { appId } : {};
  const entries = await collection.find(filter).toArray();
  return {
    entries: entries.length,
    locate: entries.filter((e) => e.kind === "locate").length,
    validate: entries.filter((e) => e.kind === "validate").length,
    hits: entries.reduce((sum, e) => sum + (e.hits ?? 0), 0),
    enabledByDefault: env.localFirstEnabled,
  };
}

export async function clearCache(appId?: string): Promise<number> {
  const collection = await locateCache();
  const result = await collection.deleteMany(appId ? { appId } : {});
  return result.deletedCount ?? 0;
}
