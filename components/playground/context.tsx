"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api, ApiError, uploadApk } from "@/lib/playground/api";
import { initialState, reducer, type Action } from "@/lib/playground/reducer";
import type { PlaygroundState } from "@/lib/playground/types";
import type { TestDto } from "@/models/types";
import { useRunEvents } from "@/hooks/useRunEvents";

const LOCAL_FIRST_KEY = "vmt.localFirst";

export type PlaygroundActions = {
  refreshApps: () => Promise<void>;
  uploadApp: (file: File) => Promise<void>;
  selectApp: (appId: string) => void;
  deleteApp: (appId: string) => Promise<void>;
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  setScript: (script: string) => void;
  runScript: () => Promise<void>;
  runLine: (lineNo: number, line: string) => Promise<void>;
  stopRun: () => Promise<void>;
  saveTest: (name?: string) => Promise<void>;
  openTest: (test: TestDto) => void;
  deleteTest: (id: string) => Promise<void>;
  newTest: () => void;
  refreshTests: () => Promise<void>;
  setLocalFirst: (enabled: boolean) => void;
  clearCache: () => Promise<void>;
  refreshCache: () => Promise<void>;
};

type ContextValue = {
  state: PlaygroundState;
  dispatch: (action: Action) => void;
  actions: PlaygroundActions;
};

const PlaygroundContext = createContext<ContextValue | null>(null);

export function usePlayground(): ContextValue {
  const value = useContext(PlaygroundContext);
  if (!value) throw new Error("usePlayground must be used inside PlaygroundProvider");
  return value;
}

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.issues.length > 0) {
      return `${error.message}: line ${error.issues[0].lineNo + 1} — ${error.issues[0].message}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const bootstrapped = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshApps = useCallback(async () => {
    try {
      dispatch({ type: "apps/loaded", apps: await api.listApps() });
    } catch (error) {
      toast.error(describe(error));
    }
  }, []);

  const refreshTests = useCallback(async () => {
    try {
      dispatch({ type: "tests/loaded", tests: await api.listTests() });
    } catch (error) {
      toast.error(describe(error));
    }
  }, []);

  const refreshCache = useCallback(async () => {
    try {
      const appId = stateRef.current.selectedAppId ?? undefined;
      dispatch({ type: "cache/set", stats: await api.cacheStats(appId) });
    } catch {
      /* cache stats are optional */
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runParam = params.get("run");
    const testParam = params.get("test");
    const stored = window.localStorage.getItem(LOCAL_FIRST_KEY);

    void (async () => {
      await Promise.all([refreshApps(), refreshTests(), refreshCache()]);

      try {
        const stats = await api.cacheStats();
        dispatch({
          type: "localFirst/set",
          enabled: stored === null ? stats.enabledByDefault : stored === "true",
        });
      } catch {
        dispatch({ type: "localFirst/set", enabled: stored !== "false" });
      }

      if (testParam) {
        try {
          const tests = await api.listTests();
          const test = tests.find((item) => item.id === testParam);
          if (test) dispatch({ type: "tests/open", test });
        } catch {
          /* ignore */
        }
      }

      if (runParam) {
        try {
          const run = await api.getRun(runParam);
          dispatch({ type: "run/hydrate", dto: run });
          if (!stateRef.current.script) {
            dispatch({ type: "script/set", script: run.script });
          }
        } catch {
          /* ignore */
        }
      }

      const sessions = await fetch("/api/sessions")
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => []);
      if (Array.isArray(sessions) && sessions.length > 0) {
        dispatch({ type: "session/ready", info: sessions[0] });
      }

      bootstrapped.current = true;
    })();
  }, [refreshApps, refreshTests, refreshCache]);

  useEffect(() => {
    if (!bootstrapped.current) return;
    const params = new URLSearchParams(window.location.search);
    if (state.run.runId) params.set("run", state.run.runId);
    else params.delete("run");
    if (state.currentTest) params.set("test", state.currentTest.id);
    else params.delete("test");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
  }, [state.run.runId, state.currentTest]);

  const runActive = state.run.status === "running" || state.run.status === "queued";

  useRunEvents(state.run.runId, runActive, state.run.lastSeq, dispatch);

  useEffect(() => {
    if (state.run.status === "passed" || state.run.status === "failed") {
      void refreshCache();
    }
  }, [state.run.status, refreshCache]);

  const actions = useMemo<PlaygroundActions>(
    () => ({
      refreshApps,
      refreshTests,
      refreshCache,

      uploadApp: async (file: File) => {
        dispatch({ type: "apps/uploadProgress", percent: 0 });
        try {
          const app = await uploadApk(file, (percent) =>
            dispatch({ type: "apps/uploadProgress", percent })
          );
          toast.success(`${app.name} — ${app.packageName}`);
          await refreshApps();
          dispatch({ type: "apps/select", appId: app.id });
        } catch (error) {
          toast.error(describe(error));
        } finally {
          dispatch({ type: "apps/uploadProgress", percent: null });
        }
      },

      selectApp: (appId: string) => dispatch({ type: "apps/select", appId }),

      deleteApp: async (appId: string) => {
        try {
          await api.deleteApp(appId);
          await refreshApps();
        } catch (error) {
          toast.error(describe(error));
        }
      },

      startSession: async () => {
        const appId = stateRef.current.selectedAppId;
        if (!appId) {
          toast.error("Choose an app first");
          return;
        }
        dispatch({ type: "session/status", status: "starting" });
        try {
          const info = await api.startSession(appId);
          dispatch({ type: "session/ready", info });
          toast.success(`Session ready on ${info.packageName}`);
        } catch (error) {
          const message = describe(error);
          dispatch({ type: "session/status", status: "error", error: message });
          toast.error(message);
        }
      },

      stopSession: async () => {
        const info = stateRef.current.session.info;
        if (!info) return;
        dispatch({ type: "session/status", status: "stopping" });
        try {
          await api.stopSession(info.sessionId);
        } catch {
          /* already gone */
        }
        dispatch({ type: "session/cleared" });
      },

      setScript: (script: string) => dispatch({ type: "script/set", script }),

      runScript: async () => {
        const current = stateRef.current;
        if (!current.session.info) {
          toast.error("Start a session first");
          return;
        }
        try {
          const { runId } = await api.runScript({
            sessionId: current.session.info.sessionId,
            script: current.script,
            testId: current.currentTest?.id ?? null,
            localFirst: current.localFirst,
          });
          dispatch({ type: "run/start", runId, mode: "full" });
        } catch (error) {
          toast.error(describe(error));
        }
      },

      runLine: async (lineNo: number, line: string) => {
        const current = stateRef.current;
        if (!current.session.info) {
          toast.error("Start a session first");
          return;
        }
        try {
          const { runId } = await api.runLine({
            sessionId: current.session.info.sessionId,
            line,
            lineNo,
            localFirst: current.localFirst,
          });
          dispatch({ type: "run/start", runId, mode: "step" });
        } catch (error) {
          toast.error(describe(error));
        }
      },

      stopRun: async () => {
        const runId = stateRef.current.run.runId;
        if (!runId) return;
        try {
          await api.stopRun(runId);
        } catch (error) {
          toast.error(describe(error));
        }
      },

      saveTest: async (name?: string) => {
        const current = stateRef.current;
        const appId = current.selectedAppId ?? current.session.info?.appId;
        if (!appId) {
          toast.error("Choose an app first");
          return;
        }
        try {
          if (current.currentTest && !name) {
            const test = await api.updateTest(current.currentTest.id, {
              name: current.currentTest.name,
              appId,
              script: current.script,
            });
            dispatch({ type: "tests/saved", test });
            toast.success(`Saved ${test.name}`);
          } else {
            const test = await api.createTest({
              name: name ?? "Untitled test",
              appId,
              script: current.script,
            });
            dispatch({ type: "tests/saved", test });
            toast.success(`Saved ${test.name}`);
          }
          await refreshTests();
        } catch (error) {
          toast.error(describe(error));
        }
      },

      openTest: (test: TestDto) => dispatch({ type: "tests/open", test }),

      deleteTest: async (id: string) => {
        try {
          await api.deleteTest(id);
          if (stateRef.current.currentTest?.id === id) {
            dispatch({ type: "tests/new" });
          }
          await refreshTests();
        } catch (error) {
          toast.error(describe(error));
        }
      },

      newTest: () => dispatch({ type: "tests/new" }),

      setLocalFirst: (enabled: boolean) => {
        window.localStorage.setItem(LOCAL_FIRST_KEY, String(enabled));
        dispatch({ type: "localFirst/set", enabled });
      },

      clearCache: async () => {
        try {
          const stats = await api.clearCache(
            stateRef.current.selectedAppId ?? undefined
          );
          dispatch({ type: "cache/set", stats });
          toast.success("Local history cleared");
        } catch (error) {
          toast.error(describe(error));
        }
      },
    }),
    [refreshApps, refreshTests, refreshCache]
  );

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions]);

  return (
    <PlaygroundContext.Provider value={value}>
      {children}
    </PlaygroundContext.Provider>
  );
}
