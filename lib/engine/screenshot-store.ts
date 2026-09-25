import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.join("public", "screenshots");
const SAFE = /^[A-Za-z0-9._-]+$/;

export function runDir(runId: string): string {
  return path.resolve(process.cwd(), ROOT, runId);
}

export async function saveScreenshot(
  runId: string,
  fileName: string,
  png: Buffer
): Promise<string> {
  if (!SAFE.test(runId) || !SAFE.test(fileName)) {
    throw new Error("Unsafe screenshot path");
  }
  const dir = runDir(runId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), png);
  return `/api/screenshots/${runId}/${fileName}`;
}

export async function readScreenshot(
  runId: string,
  fileName: string
): Promise<Buffer | null> {
  if (!SAFE.test(runId) || !SAFE.test(fileName)) return null;
  try {
    return await fs.readFile(path.join(runDir(runId), fileName));
  } catch {
    return null;
  }
}

export async function removeRunScreenshots(runId: string): Promise<void> {
  if (!SAFE.test(runId)) return;
  await fs.rm(runDir(runId), { recursive: true, force: true });
}
