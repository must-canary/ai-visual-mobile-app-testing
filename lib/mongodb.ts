import { MongoClient, type Db, type Collection } from "mongodb";
import { env } from "@/lib/env";
import type { AppDoc, LocateCacheDoc, RunDoc, TestDoc } from "@/models/types";

type MongoGlobal = {
  client?: MongoClient;
  connecting?: Promise<MongoClient>;
  indexed?: boolean;
};

const globalForMongo = globalThis as unknown as { __vmtMongo?: MongoGlobal };
const store: MongoGlobal = (globalForMongo.__vmtMongo ??= {});

async function ensureIndexes(db: Db): Promise<void> {
  if (store.indexed) return;
  store.indexed = true;
  await Promise.all([
    db.collection("locate_cache").createIndex({ appId: 1, key: 1 }),
    db.collection("locate_cache").createIndex({ lastUsedAt: -1 }),
    db.collection("runs").createIndex({ startedAt: -1 }),
    db.collection("runs").createIndex({ testId: 1, startedAt: -1 }),
    db.collection("tests").createIndex({ updatedAt: -1 }),
  ]);
}

export async function getClient(): Promise<MongoClient> {
  if (store.client) return store.client;
  if (!store.connecting) {
    store.connecting = new MongoClient(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    })
      .connect()
      .then((client) => {
        store.client = client;
        return client;
      })
      .catch((error) => {
        store.connecting = undefined;
        throw error;
      });
  }
  return store.connecting;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(env.mongodbDb);
  await ensureIndexes(db);
  return db;
}

export async function apps(): Promise<Collection<AppDoc>> {
  return (await getDb()).collection<AppDoc>("apps");
}

export async function tests(): Promise<Collection<TestDoc>> {
  return (await getDb()).collection<TestDoc>("tests");
}

export async function runs(): Promise<Collection<RunDoc>> {
  return (await getDb()).collection<RunDoc>("runs");
}

export async function locateCache(): Promise<Collection<LocateCacheDoc>> {
  return (await getDb()).collection<LocateCacheDoc>("locate_cache");
}
