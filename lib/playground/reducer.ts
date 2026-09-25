import type { SessionInfo } from "@/lib/appium/session-manager";
import type {
  AppDto,
  CacheStats,
  RunDto,
  RunEventEnvelope,
  TestDto,
} from "@/models/types";
import { applyRunEvent, emptyRun, hydrateRun } from "@/lib/playground/run-reducer";
import type {
  ConnectionState,
  PlaygroundState,
  SessionStatus,
} from "@/lib/playground/types";

export const initialState: PlaygroundState = {
  apps: [],
  appsLoaded: false,
  selectedAppId: null,
  session: { status: "idle", info: null, error: null },
  script: "",
  currentTest: null,
  saved: true,
  tests: [],
  run: emptyRun(),
  localFirst: true,
  cache: null,
  uploadProgress: null,
};

export type Action =
  | { type: "apps/loaded"; apps: AppDto[] }
  | { type: "apps/select"; appId: string | null }
  | { type: "apps/uploadProgress"; percent: number | null }
  | { type: "session/status"; status: SessionStatus; error?: string | null }
  | { type: "session/ready"; info: SessionInfo }
  | { type: "session/cleared" }
  | { type: "script/set"; script: string }
  | { type: "tests/loaded"; tests: TestDto[] }
  | { type: "tests/open"; test: TestDto }
  | { type: "tests/saved"; test: TestDto }
  | { type: "tests/new" }
  | { type: "run/start"; runId: string; mode: "full" | "step" }
  | { type: "run/hydrate"; dto: RunDto }
  | { type: "run/event"; envelope: RunEventEnvelope }
  | { type: "run/events"; envelopes: RunEventEnvelope[] }
  | { type: "run/connection"; connection: ConnectionState }
  | { type: "run/clear" }
  | { type: "localFirst/set"; enabled: boolean }
  | { type: "cache/set"; stats: CacheStats };

export function reducer(state: PlaygroundState, action: Action): PlaygroundState {
  switch (action.type) {
    case "apps/loaded":
      return {
        ...state,
        apps: action.apps,
        appsLoaded: true,
        selectedAppId:
          state.selectedAppId && action.apps.some((a) => a.id === state.selectedAppId)
            ? state.selectedAppId
            : (action.apps[0]?.id ?? null),
      };
    case "apps/select":
      return { ...state, selectedAppId: action.appId };
    case "apps/uploadProgress":
      return { ...state, uploadProgress: action.percent };
    case "session/status":
      return {
        ...state,
        session: {
          ...state.session,
          status: action.status,
          error: action.error ?? null,
        },
      };
    case "session/ready":
      return {
        ...state,
        session: { status: "ready", info: action.info, error: null },
        selectedAppId: action.info.appId,
      };
    case "session/cleared":
      return { ...state, session: { status: "idle", info: null, error: null } };
    case "script/set":
      return { ...state, script: action.script, saved: false };
    case "tests/loaded":
      return { ...state, tests: action.tests };
    case "tests/open":
      return {
        ...state,
        currentTest: action.test,
        script: action.test.script,
        saved: true,
        selectedAppId: action.test.appId || state.selectedAppId,
        run: emptyRun(),
      };
    case "tests/saved":
      return {
        ...state,
        currentTest: action.test,
        saved: true,
        tests: [
          action.test,
          ...state.tests.filter((test) => test.id !== action.test.id),
        ],
      };
    case "tests/new":
      return { ...state, currentTest: null, script: "", saved: true, run: emptyRun() };
    case "run/start":
      return {
        ...state,
        run: {
          ...emptyRun(),
          runId: action.runId,
          mode: action.mode,
          status: "running",
          connection: "connecting",
        },
      };
    case "run/hydrate":
      return { ...state, run: hydrateRun(action.dto) };
    case "run/event":
      return { ...state, run: applyRunEvent(state.run, action.envelope) };
    case "run/events":
      return {
        ...state,
        run: action.envelopes.reduce(applyRunEvent, state.run),
      };
    case "run/connection":
      return { ...state, run: { ...state.run, connection: action.connection } };
    case "run/clear":
      return { ...state, run: emptyRun() };
    case "localFirst/set":
      return { ...state, localFirst: action.enabled };
    case "cache/set":
      return { ...state, cache: action.stats };
    default:
      return state;
  }
}
