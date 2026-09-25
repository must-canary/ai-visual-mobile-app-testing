import { describe, expect, it } from "vitest";
import {
  AppDiscoveryError,
  resolveInstalledApp,
  type LauncherApp,
} from "@/lib/android/app-discovery";

const apps: LauncherApp[] = [
  { label: "MPC Wallet", packageName: "tech.example.mpc", activity: "tech.example.mpc.Main" },
  { label: "Google Chrome", packageName: "com.android.chrome", activity: "chrome.Main" },
  { label: "Chrome Beta", packageName: "com.chrome.beta", activity: "beta.Main" },
  { label: "Gmail", packageName: "com.google.android.gm", activity: "gmail.Main" },
];

describe("installed launcher app matching", () => {
  it("resolves an exact normalized label", () => {
    expect(resolveInstalledApp("MPC   Wallet", apps).packageName).toBe("tech.example.mpc");
  });

  it("resolves an exact case-insensitive label", () => {
    expect(resolveInstalledApp("gmail", apps).packageName).toBe("com.google.android.gm");
  });

  it("resolves a unique partial label", () => {
    expect(resolveInstalledApp("Wallet", apps).label).toBe("MPC Wallet");
  });

  it("fails clearly when there is no match", () => {
    expect(() => resolveInstalledApp("Calendar", apps)).toThrow(
      'No launcher-visible installed app matches "Calendar"'
    );
  });

  it("fails with labels and packages when a partial match is ambiguous", () => {
    expect(() => resolveInstalledApp("Chrome", apps)).toThrowError(AppDiscoveryError);
    expect(() => resolveInstalledApp("Chrome", apps)).toThrow(/Google Chrome \(com\.android\.chrome\)/);
    expect(() => resolveInstalledApp("Chrome", apps)).toThrow(/Chrome Beta \(com\.chrome\.beta\)/);
  });
});
