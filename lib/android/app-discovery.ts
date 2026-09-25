import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "@/lib/env";
import { readyDevices, resolveAapt2, resolveAdb } from "@/lib/android/sdk";

const run = promisify(execFile);

export type LauncherApp = {
  label: string;
  packageName: string;
  activity: string;
};

export class AppDiscoveryError extends Error {}

export function normalizeAppLabel(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function describeCandidates(apps: LauncherApp[]): string {
  return apps
    .map((app) => `${app.label} (${app.packageName})`)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}

export function resolveInstalledApp(
  requestedName: string,
  apps: LauncherApp[]
): LauncherApp {
  const requested = requestedName.trim();
  const normalized = normalizeAppLabel(requested);

  const normalizedExact = apps.filter(
    (app) => normalizeAppLabel(app.label) === normalized
  );
  if (normalizedExact.length === 1) return normalizedExact[0];
  if (normalizedExact.length > 1) {
    throw new AppDiscoveryError(
      `Installed app name "${requested}" is ambiguous: ${describeCandidates(normalizedExact)}`
    );
  }

  const caseInsensitiveExact = apps.filter(
    (app) => app.label.toLocaleLowerCase() === requested.toLocaleLowerCase()
  );
  if (caseInsensitiveExact.length === 1) return caseInsensitiveExact[0];
  if (caseInsensitiveExact.length > 1) {
    throw new AppDiscoveryError(
      `Installed app name "${requested}" is ambiguous: ${describeCandidates(caseInsensitiveExact)}`
    );
  }

  const partial = apps.filter((app) =>
    normalizeAppLabel(app.label)
      .toLocaleLowerCase()
      .includes(normalized.toLocaleLowerCase())
  );
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) {
    throw new AppDiscoveryError(
      `No launcher-visible installed app matches "${requested}"`
    );
  }
  throw new AppDiscoveryError(
    `Installed app name "${requested}" is ambiguous: ${describeCandidates(partial)}`
  );
}

function parseLauncherComponents(output: string): Array<{
  packageName: string;
  activity: string;
}> {
  const seen = new Set<string>();
  const components: Array<{ packageName: string; activity: string }> = [];
  for (const match of output.matchAll(/^\s*([A-Za-z0-9_.$]+)\/([A-Za-z0-9_.$]+)\s*$/gm)) {
    const packageName = match[1];
    const rawActivity = match[2];
    const activity = rawActivity.startsWith(".")
      ? `${packageName}${rawActivity}`
      : rawActivity;
    if (!seen.has(packageName)) {
      seen.add(packageName);
      components.push({ packageName, activity });
    }
  }
  return components;
}

async function adbText(adb: string, udid: string, args: string[]): Promise<string> {
  const { stdout } = await run(adb, ["-s", udid, "shell", ...args], {
    timeout: 30000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function adbBinary(adb: string, udid: string, args: string[]): Promise<Buffer> {
  const result = await run(adb, ["-s", udid, "exec-out", ...args], {
    timeout: 30000,
    maxBuffer: 100 * 1024 * 1024,
    encoding: "buffer",
  });
  return result.stdout;
}

async function applicationLabel(
  adb: string,
  aapt2: string,
  jar: string,
  udid: string,
  packageName: string
): Promise<string | null> {
  const packagePaths = await adbText(adb, udid, ["pm", "path", packageName]);
  const apkPath = packagePaths
    .split(/\r?\n/)
    .find((line) => line.startsWith("package:"))
    ?.slice("package:".length)
    .trim();
  if (!apkPath) return null;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vmt-app-label-"));
  try {
    const manifest = await adbBinary(adb, udid, [
      "unzip",
      "-p",
      apkPath,
      "AndroidManifest.xml",
    ]);
    const resources = await adbBinary(adb, udid, [
      "unzip",
      "-p",
      apkPath,
      "resources.arsc",
    ]);
    await fs.writeFile(path.join(tempDir, "AndroidManifest.xml"), manifest);
    await fs.writeFile(path.join(tempDir, "resources.arsc"), resources);
    await run(jar, ["c0f", "metadata.apk", "AndroidManifest.xml", "resources.arsc"], {
      cwd: tempDir,
      timeout: 30000,
    });
    const { stdout } = await run(aapt2, ["dump", "badging", path.join(tempDir, "metadata.apk")], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.match(/^application-label:'([^']*)'$/m)?.[1]?.trim() || null;
  } catch {
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function resolveJar(): Promise<string | null> {
  const executable = process.platform === "win32" ? "jar.exe" : "jar";
  const candidates: string[] = [];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, "bin", executable));
  }
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const javaRoot = path.join(programFiles, "Java");
    try {
      const entries = await fs.readdir(javaRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          candidates.push(path.join(javaRoot, entry.name, "bin", executable));
        }
      }
    } catch {
      /* Java may be installed elsewhere */
    }
    candidates.push(
      path.join(programFiles, "Android", "Android Studio", "jbr", "bin", executable)
    );
  } else {
    candidates.push("/usr/bin/jar", "/usr/local/bin/jar");
  }
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* try the next installation */
    }
  }
  return null;
}

export async function discoverLauncherApps(): Promise<LauncherApp[]> {
  const adb = resolveAdb();
  const aapt2 = resolveAapt2();
  const jar = await resolveJar();
  if (!adb || !aapt2 || !jar) {
    throw new AppDiscoveryError(
      "Android app discovery requires adb, aapt2, and a JDK; configure the Android SDK and JAVA_HOME"
    );
  }
  const devices = await readyDevices();
  const device = env.androidUdid
    ? devices.find((item) => item.udid === env.androidUdid)
    : devices[0];
  if (!device) throw new AppDiscoveryError("No connected Android device is ready");

  const output = await adbText(adb, device.udid, [
    "cmd",
    "package",
    "query-activities",
    "--components",
    "-a",
    "android.intent.action.MAIN",
    "-c",
    "android.intent.category.LAUNCHER",
  ]);
  const components = parseLauncherComponents(output);
  const apps: LauncherApp[] = [];
  for (const component of components) {
    const label = await applicationLabel(
      adb,
      aapt2,
      jar,
      device.udid,
      component.packageName
    );
    if (label) apps.push({ ...component, label });
  }
  return apps;
}

export async function resolveInstalledAppByName(
  requestedName: string
): Promise<LauncherApp> {
  return resolveInstalledApp(requestedName, await discoverLauncherApps());
}
