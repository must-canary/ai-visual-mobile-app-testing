import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "@/lib/env";

const run = promisify(execFile);
const EXE = process.platform === "win32" ? ".exe" : "";

function candidateSdkRoots(): string[] {
  const roots: string[] = [];
  if (env.androidHome) roots.push(env.androidHome);
  const home = os.homedir();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    roots.push(path.join(local, "Android", "Sdk"));
  } else if (process.platform === "darwin") {
    roots.push(path.join(home, "Library", "Android", "sdk"));
  } else {
    roots.push(path.join(home, "Android", "Sdk"));
  }
  return roots;
}

export function resolveSdkRoot(): string | null {
  for (const root of candidateSdkRoots()) {
    if (root && fs.existsSync(root)) return root;
  }
  return null;
}

export function resolveAdb(): string | null {
  const root = resolveSdkRoot();
  if (!root) return null;
  const adb = path.join(root, "platform-tools", `adb${EXE}`);
  return fs.existsSync(adb) ? adb : null;
}

export function resolveAapt2(): string | null {
  if (env.aapt2Path && fs.existsSync(env.aapt2Path)) return env.aapt2Path;
  const root = resolveSdkRoot();
  if (!root) return null;
  const buildTools = path.join(root, "build-tools");
  if (!fs.existsSync(buildTools)) return null;
  const versions = fs
    .readdirSync(buildTools)
    .filter((name) => fs.existsSync(path.join(buildTools, name, `aapt2${EXE}`)))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (versions.length === 0) return null;
  return path.join(buildTools, versions[0], `aapt2${EXE}`);
}

export type AdbDevice = {
  udid: string;
  state: string;
};

export async function listDevices(): Promise<AdbDevice[]> {
  const adb = resolveAdb();
  if (!adb) {
    throw new Error(
      "adb was not found. Set ANDROID_HOME in .env.local to your Android SDK directory."
    );
  }
  const { stdout } = await run(adb, ["devices"], { timeout: 15000 });
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("*"))
    .map((line) => {
      const [udid, state] = line.split(/\s+/);
      return { udid, state };
    })
    .filter((device) => Boolean(device.udid));
}

export async function readyDevices(): Promise<AdbDevice[]> {
  const devices = await listDevices();
  return devices.filter((device) => device.state === "device");
}
