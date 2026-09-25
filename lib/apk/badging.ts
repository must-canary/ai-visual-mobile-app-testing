import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveAapt2 } from "@/lib/android/sdk";

const run = promisify(execFile);

export type Badging = {
  packageName: string;
  activity: string;
  versionName: string;
  label: string;
};

function pick(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  return match ? match[1] : null;
}

export async function readBadging(apkPath: string): Promise<Badging> {
  const aapt2 = resolveAapt2();
  if (!aapt2) {
    throw new Error(
      "aapt2 was not found. Set AAPT2_PATH or ANDROID_HOME in .env.local."
    );
  }

  let stdout: string;
  try {
    const result = await run(aapt2, ["dump", "badging", apkPath], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120000,
    });
    stdout = result.stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`aapt2 could not read this file as an APK: ${message}`);
  }

  const packageName = pick(stdout, /package:\s*name='([^']+)'/);
  if (!packageName) {
    throw new Error("aapt2 did not report a package name for this file");
  }

  const activity =
    pick(stdout, /launchable-activity:\s*name='([^']+)'/) ??
    pick(stdout, /android\.intent\.action\.MAIN[\s\S]*?name='([^']+)'/);
  if (!activity) {
    throw new Error("This APK does not declare a launchable activity");
  }

  return {
    packageName,
    activity,
    versionName: pick(stdout, /versionName='([^']*)'/) ?? "",
    label:
      pick(stdout, /application-label:'([^']*)'/) ??
      pick(stdout, /application-label-en[^:]*:'([^']*)'/) ??
      packageName,
  };
}
