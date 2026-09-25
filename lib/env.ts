function raw(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function num(name: string, fallback: number): number {
  const value = raw(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = raw(name);
  if (!value) return fallback;
  return value.toLowerCase() !== "false" && value !== "0";
}

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const env = {
  get visionProvider(): "anthropic" | "gemini" {
    const provider = raw("VISION_PROVIDER")?.toLowerCase();
    if (provider === "anthropic" || provider === "gemini") return provider;
    throw new Error('VISION_PROVIDER must be set to either "gemini" or "anthropic".');
  },
  get geminiApiKey(): string | undefined {
    return raw("GEMINI_API_KEY");
  },
  get geminiBaseUrl(): string {
    return raw("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta";
  },
  get anthropicApiKey(): string | undefined {
    return raw("ANTHROPIC_API_KEY");
  },
  get anthropicAuthToken(): string | undefined {
    return raw("ANTHROPIC_AUTH_TOKEN");
  },
  get anthropicBaseUrl(): string | undefined {
    return raw("ANTHROPIC_BASE_URL");
  },
  get anthropicWorkspaceId(): string | undefined {
    const value = raw("ANTHROPIC_WORKSPACE_ID");
    if (!value || !WORKSPACE_ID_PATTERN.test(value)) return undefined;
    return value;
  },
  get visionModel(): string {
    const model = raw("VISION_MODEL");
    if (!model) throw new Error("VISION_MODEL must be set in .env.local.");
    return model;
  },
  get mongodbUri(): string {
    return raw("MONGODB_URI") ?? "mongodb://localhost:27017";
  },
  get mongodbDb(): string {
    return raw("MONGODB_DB") ?? "visualmbtesting";
  },
  get appiumUrl(): string {
    return raw("APPIUM_URL") ?? "http://127.0.0.1:4723";
  },
  get androidUdid(): string | undefined {
    return raw("ANDROID_UDID");
  },
  get androidHome(): string | undefined {
    return raw("ANDROID_HOME") ?? raw("ANDROID_SDK_ROOT");
  },
  get aapt2Path(): string | undefined {
    return raw("AAPT2_PATH");
  },
  get mpcPin(): string | undefined {
    return raw("MPC_PIN");
  },
  get localFirstEnabled(): boolean {
    return bool("LOCAL_FIRST_ENABLED", true);
  },
  get localFirstScreenDistance(): number {
    return num("LOCAL_FIRST_SCREEN_DISTANCE", 10);
  },
  get localFirstPatchDistance(): number {
    return num("LOCAL_FIRST_PATCH_DISTANCE", 6);
  },
  get localFirstValidateDistance(): number {
    return num("LOCAL_FIRST_VALIDATE_DISTANCE", 4);
  },
  get localFirstMaxMisses(): number {
    return num("LOCAL_FIRST_MAX_MISSES", 2);
  },
};
