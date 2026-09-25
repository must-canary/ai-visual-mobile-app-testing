import type { SessionInfo } from "@/lib/appium/session-manager";
import type { AppDto, CacheStats, RunDto, TestDto } from "@/models/types";
import type { ParseIssue } from "@/lib/playground/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ParseIssue[] = []
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.errors ?? []
    );
  }
  return body as T;
}

export const api = {
  listApps: () => request<AppDto[]>("/api/apps"),
  deleteApp: (id: string) => request<{ ok: true }>(`/api/apps/${id}`, { method: "DELETE" }),

  startSession: (appId: string, reset: "none" | "clear" | "reinstall" = "none") =>
    request<SessionInfo>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ appId, reset }),
    }),
  stopSession: (id: string) =>
    request<{ ok: true }>(`/api/sessions/${id}`, { method: "DELETE" }),

  runScript: (input: {
    sessionId: string;
    script: string;
    testId?: string | null;
    localFirst: boolean;
  }) =>
    request<{ runId: string }>("/api/runs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  runLine: (input: {
    sessionId: string;
    line: string;
    lineNo: number;
    localFirst: boolean;
  }) =>
    request<{ runId: string }>("/api/runs/step", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getRun: (id: string) => request<RunDto>(`/api/runs/${id}`),
  stopRun: (id: string) =>
    request<{ ok: true }>(`/api/runs/${id}/stop`, { method: "POST" }),

  listTests: () => request<TestDto[]>("/api/tests"),
  createTest: (input: { name: string; appId: string; script: string }) =>
    request<TestDto>("/api/tests", { method: "POST", body: JSON.stringify(input) }),
  updateTest: (id: string, input: { name: string; appId: string; script: string }) =>
    request<TestDto>(`/api/tests/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteTest: (id: string) =>
    request<{ ok: true }>(`/api/tests/${id}`, { method: "DELETE" }),

  cacheStats: (appId?: string) =>
    request<CacheStats>(`/api/cache${appId ? `?appId=${appId}` : ""}`),
  clearCache: (appId?: string) =>
    request<CacheStats>(`/api/cache${appId ? `?appId=${appId}` : ""}`, {
      method: "DELETE",
    }),
};

export function uploadApk(
  file: File,
  onProgress: (percent: number) => void
): Promise<AppDto> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/apps");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let body: { error?: string } | AppDto | null = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as AppDto);
      } else {
        reject(
          new ApiError(
            (body as { error?: string })?.error ?? `Upload failed (${xhr.status})`,
            xhr.status
          )
        );
      }
    };
    xhr.onerror = () => reject(new ApiError("Upload failed", 0));
    xhr.send(form);
  });
}
