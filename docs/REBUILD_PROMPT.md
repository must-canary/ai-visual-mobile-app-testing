# Build prompt: Visual Mobile Automation Testing playground

Paste everything below this line into a fresh Claude Code session in an empty directory.

---

Build a vision-based mobile UI test playground in this empty directory. Plan the phases first, then implement all of them and verify each against the real emulator before moving on. Do not stop until the acceptance script at the end passes.

## 1. Goal

A single-page web app where a tester uploads an Android APK, writes test steps in plain English (no selectors, ids or XPaths, ever), runs them live on an Android emulator through Appium, watches every step execute in the browser with screenshots, saves the script as a test, and reopens it later to edit and re-run. Claude vision resolves each plain-English description to on-screen coordinates at run time. A local-first history reuses earlier resolutions so repeat runs need few or no vision calls.

## 2. Environment assumptions (verify with commands before coding)

- macOS, Node 20+, MongoDB on `mongodb://localhost:27017`.
- Appium 3 installed globally with the `uiautomator2` driver, started manually with `appium` on `http://127.0.0.1:4723` with base path `/` (not `/wd/hub`). Appium 3 does not expose `GET /appium/sessions` unless started with `--allow-insecure=session_discovery`; treat that call as best-effort.
- One Android emulator booted and listed by `adb devices` (for example `emulator-5554`).
- Android build-tools with `aapt2` (for example `~/Library/Android/sdk/build-tools/36.1.0/aapt2`) to read package name and launchable activity from an APK.
- An Anthropic API key in `.env.local`. If the key is organization-level, the API returns 400 "This API key is not scoped to a workspace" and every request must carry an `anthropic-workspace-id` header; support an `ANTHROPIC_WORKSPACE_ID` variable and pass it as a default header on the SDK client.
- Run the dev server on a free port (3000 may be taken); check with `lsof -nP -iTCP:3000 -sTCP:LISTEN`.

## 3. Stack and non-negotiable decisions

- Next.js 15 App Router (`create-next-app@15`, TypeScript, Tailwind 4, no `src/`), React 19, `dev` uses Turbopack.
- shadcn/ui via `npx shadcn@latest init` then `add button badge card textarea resizable tabs scroll-area dialog alert-dialog select tooltip sonner separator input skeleton switch`. The current shadcn style is built on Base UI, not Radix: `TooltipTrigger` takes `render={<button/>}` instead of `asChild`, `ResizablePanelGroup` takes `orientation`, and `Select` needs an `items` map (value to label) or the trigger shows the raw value.
- Dependencies: `mongodb` (native driver, no mongoose), `webdriverio@9`, `sharp`, `zod`, `@anthropic-ai/sdk` (current version; it must have `client.beta.messages.parse` and `@anthropic-ai/sdk/helpers/beta/zod`), `lucide-react`, `vitest` for unit tests.
- `next.config.ts`: `serverExternalPackages: ["webdriverio","webdriver","@wdio/protocols","@wdio/logger","@wdio/types","@wdio/globals","@wdio/utils","@wdio/config","@wdio/repl","sharp","mongodb"]`. No webpack block (Turbopack ignores it and warns).
- Single user, no login. Android only. Everything runs inside the Next.js process; long-lived objects (Appium sessions, run event buses, Mongo client, Anthropic client) live on `globalThis` so they survive hot reloads.
- Code style: no comments in source files. Explanations go in the README.
- Env vars (`.env.local`, with a committed `.env.example`): required `VISION_PROVIDER=gemini|anthropic`, required provider-specific `VISION_MODEL`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `MONGODB_URI`, `MONGODB_DB=visualmbtesting`, `APPIUM_URL=http://127.0.0.1:4723`, `ANDROID_UDID`, `AAPT2_PATH`, `LOCAL_FIRST_ENABLED=true`, `LOCAL_FIRST_SCREEN_DISTANCE=10`, `LOCAL_FIRST_PATCH_DISTANCE=6`, `LOCAL_FIRST_VALIDATE_DISTANCE=4`, `LOCAL_FIRST_MAX_MISSES=2`. Read env through one `lib/env.ts`; only `VISION_PROVIDER` selects the vision client.
- Gitignore `node_modules`, `.next`, `.env*` except `.env.example`, `/uploads`, `/public/screenshots`.

## 4. Directory layout

```
app/page.tsx, app/layout.tsx (adds sonner Toaster)
app/api/apps/route.ts, app/api/apps/[id]/route.ts
app/api/sessions/route.ts, app/api/sessions/[id]/route.ts, app/api/sessions/[id]/screen/route.ts
app/api/runs/route.ts, app/api/runs/step/route.ts, app/api/runs/[id]/route.ts,
app/api/runs/[id]/events/route.ts, app/api/runs/[id]/stop/route.ts
app/api/tests/route.ts, app/api/tests/[id]/route.ts
app/api/cache/route.ts
app/api/screenshots/[...path]/route.ts
lib/env.ts, lib/mongodb.ts
lib/apk/badging.ts, lib/apk/upload.ts
lib/appium/session-manager.ts, gestures.ts, screenshot.ts, coords.ts
lib/vision/client.ts, prompts.ts, schemas.ts, locate.ts, image.ts, phash.ts
lib/dsl/types.ts, commands.ts, parser.ts
lib/engine/event-types.ts, events.ts, run-controller.ts, step-executor.ts, screenshot-store.ts, locate-cache.ts
lib/playground/types.ts, reducer.ts, run-reducer.ts, api.ts, dsl-lines.ts, palette.ts, highlight.ts
hooks/useDeviceMirror.ts, hooks/useRunEvents.ts
components/playground/Playground.tsx, context.tsx, SessionBar.tsx, AppPicker.tsx, LocalFirstControl.tsx,
  DevicePanel.tsx, ScriptEditor.tsx, CommandPalette.tsx, ExecutionLog.tsx, StepCard.tsx, StageTimeline.tsx,
  ScreenshotPair.tsx, LocateOverlay.tsx, RunSummary.tsx, TestsSidebar.tsx, SaveTestDialog.tsx
models/types.ts
tests/parser.test.ts, coords.test.ts, highlight.test.ts, phash.test.ts
vitest.config.mts (alias @ to the project root, uses import.meta.dirname)
README.md
```

## 5. Data model (MongoDB)

- `apps`: `{ _id, name, originalName, filePath: "uploads/apks/<file>", size, packageName, activity, versionName, uploadedAt }`. Store the relative path; resolve to absolute with `path.resolve(process.cwd(), ...)` only when handing it to Appium.
- `tests`: `{ _id, name, appId, script, createdAt, updatedAt, lastRunId }`. The script text is the only source of truth; the server re-parses it on save and rejects parse errors with line numbers.
- `runs`: `{ _id, testId|null, appId, sessionId, script, mode: "full"|"step", localFirst, status: queued|running|passed|failed|stopped, startedAt, finishedAt, error, usage, steps: StepResult[], events: [] }`.
- `StepResult`: `{ index, lineNo, raw, kind, status: pending|running|passed|failed|healed|skipped, stages: {capture,classify,locate,act,verify: {status, ms, detail}}, beforeUrl, afterUrl, locate?: {found, x, y, matchedText, confidence, candidates[], reason, sentW, sentH, deviceX, deviceY, source: "vision"|"local", screenDistance}, verify?: [{attempt, result, confidence, evidence, reason, screenshotUrl, source}], tokens, latencyMs, error }`.
- `usage`: `{ calls, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, estCostUsd, localHits }`.
- `locate_cache`: `{ _id, appId, kind: "locate"|"validate", key, description, screenHash, patchHash, sentW, sentH, x, y, matchedText, confidence, evidence, hits, misses, createdAt, lastUsedAt, lastRunId }` with an index on `{appId, key}`.
- Sessions are in-memory only.
- Provide DTO mappers that convert ObjectIds and Dates to strings for the client.

## 6. API contract

| Route | Body | Returns |
| --- | --- | --- |
| `POST /api/apps` multipart `file` | APK, streamed to `uploads/apks`, 500 MB cap | 201 AppDto after `aapt2 dump badging`; 400 if not an APK or badging fails (delete the file) |
| `GET /api/apps`, `DELETE /api/apps/:id` | | list; delete refused with 409 while a session uses the app |
| `POST /api/sessions` | `{appId, reset?: "none"\|"clear"\|"reinstall"}` | 201 `{sessionId, packageName, activity, window:{w,h}, screenshot:{w,h}, scale, ...}`; 503 with a clear message when Appium is unreachable or `adb devices` is empty; 502 when session creation fails |
| `GET /api/sessions`, `GET/DELETE /api/sessions/:id` | | list, status, stop |
| `GET /api/sessions/:id/screen` | honors `If-None-Match` | `image/jpeg` 540 px wide, quality 60, `ETag: "<frameSeq>"`, `X-Frame-Source: live\|run`, `Cache-Control: no-store`; 304 when unchanged |
| `POST /api/runs` | `{sessionId, script, testId?, localFirst?}` | 202 `{runId}`; 400 with `{error, errors:[{lineNo, raw, message}]}` on parse errors; 409 when a run is active on the session |
| `POST /api/runs/step` | `{sessionId, line, lineNo, localFirst?}` | 202 `{runId}` for a one-step run on the same session |
| `GET /api/runs?testId=&limit=` | | newest first, without events |
| `GET /api/runs/:id` | | RunDto with `lastSeq` |
| `GET /api/runs/:id/events?after=` | SSE, also honors `Last-Event-ID` | see events below; a finished run replays from Mongo and closes |
| `POST /api/runs/:id/stop` | | aborts via AbortController; 409 if not active |
| `GET/POST /api/tests`, `GET/PUT/DELETE /api/tests/:id` | `{name, appId, script}` | delete also removes the test's runs and their screenshot folders |
| `GET /api/cache?appId=`, `DELETE /api/cache?appId=` | | stats `{entries, locate, validate, hits, enabledByDefault}`; clear |
| `GET /api/screenshots/:runId/:file` | | serves `public/screenshots/<runId>/<file>`, rejects any segment that is not `[a-zA-Z0-9._-]+` |

SSE format: `id: <seq>\nevent: <type>\ndata: <json envelope {seq,type,data,at}>\n\n`, a `: connected` comment first, a heartbeat comment every 15 s, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, unsubscribe on `request.signal`. Event types: `run:start {runId,totalSteps,mode,script}`, `step:start {index,lineNo,raw,kind}`, `stage {index,stage,status:start|ok|fail|skip,ms,detail}`, `screenshot {index,phase:before|after,url}`, `locate {index,result}`, `verify {index,attempt}`, `step:end {index,status,latencyMs,tokens,error}`, `run:end {status,usage,error,durationMs}`, `log {level,msg}`.

## 7. Appium layer

- `session-manager.ts`: `globalThis` map of `LiveSession {id, appId, packageName, activity, driver, window, shotSize, scale, queue, frameSeq, lastFrame, activeRunId, startedAt, lastUsedAt}`. `withDriver(session, fn)` chains every driver call onto `session.queue` so the mirror never interleaves with a gesture. `startSession` checks `GET /status`, checks `adb devices`, stops any existing session in the map, best-effort deletes orphan Appium sessions, then `remote({hostname, port, path: "/", logLevel: "error", capabilities: {platformName: "Android", "appium:automationName": "UiAutomator2", "appium:udid", "appium:app": absolutePath, "appium:appPackage", "appium:appActivity", "appium:noReset": reset==="none", "appium:fullReset": reset==="reinstall", "appium:newCommandTimeout": 0, "appium:autoGrantPermissions": true}})`. After connecting, read `getWindowSize()` and one screenshot's size with sharp; `scale = screenshotWidth / windowWidth` (use widths only, heights differ because of the navigation bar). Idle reaper closes sessions unused for 15 minutes.
- `getFrame(session)`: return the cached frame when a run is active or the frame is under 400 ms old, else take a screenshot through the queue and cache a 540 px JPEG. The run engine's Capture stage also writes into this cache so the mirror stays fresh during runs.
- `gestures.ts` via `driver.execute`: `mobile: clickGesture {x,y}`, `mobile: type {text}` with fallback to `driver.keys`, `mobile: swipeGesture {left: 10% of width, top: 15% of height, width: 80%, height: 70%, direction, percent}`, `mobile: pressKey {keycode: 4}` for back, `mobile: activateApp / terminateApp / clearApp {appId}`, `mobile: backgroundApp {seconds: -1}`, `hideKeyboard` when `isKeyboardShown`, and `readFocusedText` using `getActiveElement` plus `getElementText`.
- `coords.ts`: `CoordinateMapper({shotW, shotH, sentW, sentH, winW, winH})`, `toDevice(x,y)` = sent pixel to screenshot pixel to device pixel (divide by `scale`). `scrollToSwipeDirection`: scroll down is swipe up, and so on. Unit-test both.

## 8. DSL

Table-driven: `commands.ts` exports an ordered `CommandSpec[] {kind, usage, description, patterns: RegExp[], build}`; `parser.ts` tries specs in order per line, first match wins, unmatched non-blank lines are parse errors carrying `lineNo` (0-based) and a hint. Steps keep `lineNo` and `raw`. Kinds and syntax (case-insensitive except the uppercase system commands):

- `# comment`
- `Tap on <desc>` (also `Tap`, `Tap the`, `Click`, `Press`)
- `Type "<text>" in <field>` (also `into`, `on`; unquoted text allowed; `Type "<text>"` alone types into the focused field)
- `Validate that <condition>` (also `Verify`, `Confirm`, `Check`, `Assert`, with or without `that`)
- `Scroll <up|down|left|right>`, `Scroll <dir> by <n>%`, `Scroll <dir> until "<target>" is visible` (also `Swipe`, `Drag`, `Slide`; `till`, `untill`)
- `Wait Until <n> Seconds` (also `wait 2s`)
- `OPEN_APP [package]`, `KILL_APP [package]`, `CLEAR_APP [package]`, `MINIMISE_APP [package]` (also `MINIMIZE_APP`), `PRESS_DEVICE_BACK_BUTTON`

## 9. Vision layer

- `client.ts`: lazy `new Anthropic({apiKey, defaultHeaders: workspaceId ? {"anthropic-workspace-id": workspaceId} : undefined})` on `globalThis`. One `callVision({schema, system, imageBase64, text, effort, signal})` that calls `client.beta.messages.parse` with `max_tokens: 1024`, `system: [{type:"text", text, cache_control:{type:"ephemeral"}}]`, one user message with an image block (`base64`, `image/png`) then a text block, and `output_config: {format: betaZodOutputFormat(schema)}`. Add `effort: "low"` only for models that support it (not Haiku), and `betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"` only for Opus 5 and Fable models. Never send `thinking`, `budget_tokens`, or assistant prefill. Handle `stop_reason === "refusal"` as an error. Retry once when `parsed_output` is null. Return usage (input, output, cache read, cache write tokens) and an estimated cost from a prefix-matched price table (opus-5 5/25, sonnet-5 2/10, haiku-4-5 1/5 per MTok, cache read at 10 percent, cache write at 125 percent).
- `image.ts`: downscale the PNG with sharp so the longest edge is at most 1568 px; return base64, the resized PNG buffer, and sent width and height. Ask the model for pixel coordinates in that sent image, and state the image size in the user text (`Image size: WxH pixels.\nTarget: ...`).
- `schemas.ts` (zod): `LocateResult {found, x|null, y|null, matched_text|null, confidence 0..1, candidates: [{x,y,label}], reason}`, `ValidateResult {result, confidence, evidence, reason}`.
- `prompts.ts` LOCATE system prompt: role statement; coordinates are pixels in the supplied image with origin top-left; resolution priority in order: exact visible text label, icon by common name, position within a list, relation to a neighbour, containment in a named section, visual attribute; rules: match only visible evidence, return the centre of the tappable area (for a text field the input box, not its label), exactly one match sets found=true with matched_text and confidence, two or more equal matches set found=false and list every candidate, no match sets found=false with an explanation, ignore the software keyboard unless named, JSON only. VALIDATE system prompt: decide solely on visible evidence, case-insensitive text, "visible" means legible on screen, no assumptions from earlier steps, result=true only when unambiguous, quote the evidence, JSON only.
- `locate.ts`: `locate`, `validate`, `MIN_LOCATE_CONFIDENCE = 0.6`, and `explainLocateFailure` that lists candidates with coordinates when ambiguous.
- `phash.ts`: 64-bit difference hash (grayscale, resize to 9x8, compare horizontal neighbours) as 16 hex characters, `patchHash(png, x, y, size)` for a crop around a point clamped at the edges, and `hamming(a, b)`.

## 10. Engine

- `events.ts`: `RunEventBus` (EventEmitter with a sequence counter and a ring buffer of the last 5000 envelopes, `since(after)`), a `globalThis` registry of active runs `{runId, sessionId, bus, abort: AbortController, done}` retained 5 minutes after `run:end`, and `formatSse`.
- `run-controller.ts`: `startRun({session, script, steps, testId, mode, localFirst})` inserts the run document with all steps pending, registers the bus, sets `session.activeRunId`, and executes in the background. Execution loop: emit `run:start`; for each step check the abort signal, run `executeStep`, persist steps and usage after every step; stop on the first failed step and mark the rest skipped; on abort mark the rest skipped and the run `stopped`; emit `run:end`; persist status, error, usage, events, `finishedAt`; update the test's `lastRunId`; clear `activeRunId`.
- `step-executor.ts`: `executeStep(ctx, step, index)` where `ctx = {runId, session, bus, signal, usage, localFirst, appId}`. Emit `step:start`, then stages through a `runStage` helper that emits start, ok or fail with elapsed ms and detail, and a `skipStage` helper. Stages per kind:
  - capture: screenshot through the queue, save `public/screenshots/<runId>/<index>-before.png`, update the mirror frame, emit `screenshot`.
  - classify: record the handler chosen.
  - locate: for tap, type-with-field, and scroll-until. Resolution order: if `ctx.localFirst`, look up the local history (below); else or on no match, call vision. Emit `locate` with the full info including `source`. Fail the stage when not found, confidence under 0.6, or more than one candidate, with the candidate list in the message.
  - act: tap uses `clickGesture` at the mapped device point. Type taps the field (if any), presses Ctrl+A (`mobile: pressKey {keycode: 29, metastate: 4096}`) and forward-delete (keycode 112), types via `mobile: type`, reads the focused field text back, then hides the keyboard. Scroll swipes with the inverted direction; scroll-until swipes up to 8 times, re-capturing and re-resolving after each swipe. Wait sleeps in 250 ms slices checking the abort signal. System commands call the matching `mobile:` command.
  - verify: validate steps call vision up to 3 times, 1.5 s apart, re-capturing between attempts, emitting a `verify` event per attempt, failing after the third false. Action steps take an after screenshot (700 ms settle, 2500 ms after app commands).
  - Local-first sanity check: after a cached tap or type, compare before and after with the screen hash and, if unchanged, a 2x patch hash around the point. For type, a successful read-back of the typed text counts as confirmation without hashing. If nothing changed, record a miss on the entry, re-locate with vision on the current screen, and if the fresh point moved more than 40 device pixels, redo the action, take a new after screenshot and mark the step `healed`; if it agrees with the cached point, accept.
- `locate-cache.ts`: key is `kind + ":" + description lowercased with collapsed whitespace`, scoped by app and sent image size. `findLocate` loads the 10 most recent entries for the key, computes the current screen hash, keeps entries within `LOCAL_FIRST_SCREEN_DISTANCE` whose patch hash around the saved point is within `LOCAL_FIRST_PATCH_DISTANCE`, and returns the closest. `saveLocate` replaces any entry with the same key and screen hash. `findValidate`/`saveValidate` use only the screen hash at `LOCAL_FIRST_VALIDATE_DISTANCE` and save only successful validations. `recordHit` increments hits and bumps `lastUsedAt`; `recordMiss` increments misses and deletes at `LOCAL_FIRST_MAX_MISSES`. `cacheStats` and `clearCache` back the cache API. Local hits increment `usage.localHits` and do not count as vision calls.
- `screenshot-store.ts`: write PNGs under `public/screenshots/<runId>/` and return `/api/screenshots/<runId>/<file>` URLs; a helper removes a run's folder.

## 11. Playground UI

- One client component `Playground` owning a `useReducer` state `{apps, appsLoaded, selectedAppId, session:{status, info, error}, script, currentTest, saved, tests, run, localFirst}` exposed through a context with `state`, `dispatch`, and `actions` (start/stop session, run script, run line, stop run, save test, open test, delete test, new test, refresh apps). The run sub-state is `{runId, mode, status, steps by index, order, activeStepIndex, usage, error, lastSeq, connection, durationMs, logs}` with a pure `applyRunEvent` reducer that folds every SSE envelope into step state (dropping seq <= lastSeq) and a `hydrateRun(RunDto)` for reloads.
- Layout: collapsible `TestsSidebar` on the left, `SessionBar` on top (app picker with upload progress via XHR, session status dot and start/stop button, local-first switch with saved/hit counts and a clear button, saved-test name badge with a dirty marker, Save and Run/Stop buttons), then a horizontal `ResizablePanelGroup` with `ScriptEditor` (36 percent), `ExecutionLog` (36 percent) and `DevicePanel` (28 percent).
- `useDeviceMirror(sessionId, intervalMs, enabled)`: a self-rescheduling `fetch` loop (not `setInterval`) with `If-None-Match`, blob URLs swapped and revoked, one in-flight request, paused when `document.hidden`, 700 ms idle and 1500 ms during a run, stopping on 404.
- `useRunEvents(runId, active, lastSeq, dispatch)`: one `EventSource` on `/api/runs/:id/events?after=<lastSeq>`, listeners for every event type, JSON envelopes buffered and flushed once per animation frame, connection state on open and error, closed on cleanup. Keep `?run=<id>` and `?test=<id>` in the URL with `history.replaceState`; on mount read them first, hydrate the run from `GET /api/runs/:id`, then subscribe if it is still running. Do not add any effect that clears the query before the mount effect reads it.
- `ScriptEditor`: a monospace textarea (13 px, 24 px line height, 8 px top padding, `wrap="off"`, `tabSize 2`) with a scroll-synced gutter showing line numbers, a pass/fail/healed/skipped/running marker per line (mapped by `lineNo`), and a hover play button that runs only that line. A blue band highlights the executing line. Syntax highlighting: render a `<pre>` behind the textarea with identical font, padding and whitespace, translated by the textarea's scrollTop and scrollLeft; make the textarea text transparent while keeping the caret and selection visible. Tokenizer colours: action keywords bold violet, system commands bold magenta, quoted strings green, numbers and percentages amber, directions sky blue, connector words (`in`, `the`, `until`, `is visible`, ...) muted grey, package names teal, comments italic grey, `{{variables}}` orange; lines the parser rejects get a red wavy underline with the error as the title. Autocomplete: when the caret sits on an empty line (or after `/`), or the typed prefix matches a command label, show a popup below that line listing every command with its label, argument hint and description; arrow keys move the highlight; Tab inserts; Enter inserts only after typing a filter or navigating (plain Enter on a blank line still inserts a newline); Escape dismisses for that line; clicking inserts; inserted snippets place the caret where typing continues (for example inside the quotes of `Type "" in `); the popup closes after an insert and during a run. Cmd+Enter runs, Cmd+S saves.
- `ExecutionLog`: a `StepCard` per step showing index, kind badge, raw line, status pill, latency; a five-pill `StageTimeline` with ms and a tooltip showing the stage detail; the locate summary (matched label, confidence, device point, a "local history" chip when reused, and a numbered red list of candidates when ambiguous); verify attempts; the error in a red block; before and after thumbnails with a click-to-zoom dialog, the before image wrapped in an SVG overlay (`viewBox` equal to the sent image size, `preserveAspectRatio="xMidYMid meet"`) drawing a green circle at the resolved point and red numbered circles at candidates. A sticky `RunSummary` shows status, counts of passed/failed/healed/skipped, duration, vision calls, tokens, cost, and how many resolutions came from local history. An engine log details block lists `log` events.
- `TestsSidebar`: list of saved tests with app name and date, open with an unsaved-changes confirm, delete with an alert dialog, a New button. `SaveTestDialog` for name entry. Persist the local-first toggle in `localStorage` under `vmt.localFirst`, defaulting to the server's `enabledByDefault`.

## 12. README

Document requirements, setup, every env variable, the step syntax with synonyms, the five stages, the local-first history and its thresholds, and the npm scripts (`dev`, `typecheck`, `test`).

## 13. Verification (do all of it, in this order, and report results with numbers)

1. `npm run typecheck`, `npm run lint`, `npm test` must pass. Unit tests must cover the parser (every kind and synonym, line numbers, error collection), the coordinate mapper and direction inversion, the tokenizer (token sequences and full-line reconstruction), and the hashes (stable, small change close, different screen far, patch clamping).
2. Upload an APK through `POST /api/apps` and confirm package name and activity in the response.
3. Start a session, fetch `/screen`, confirm a JPEG with an ETag and that a second request with `If-None-Match` returns 304 within 400 ms.
4. Run this script through `POST /api/runs` and follow the SSE stream to `run:end`; every step must pass and every stage must appear:

```
KILL_APP
OPEN_APP
Tap on the plus button
Type "Buy milk" in the task title field
Tap on Save
Validate that "Buy milk" is visible in the list
```

5. Run it again with local-first on: at least 3 of the 4 resolutions must come from history and vision calls must drop. Run it with local-first off: 4 vision calls, 0 local hits.
6. Run `Tap on the checkbox` as a single step on a screen with many checkboxes: it must fail and list the candidates.
7. Start a run containing `Wait Until 20 Seconds`, stop it after a few seconds: status `stopped`, remaining steps `skipped`, session still alive.
8. Create, update, fetch and delete a test through the API; a script with an unknown line must be rejected with the line number.
9. Open the page in a browser: the mirror shows the device, the app picker shows app names, the editor highlights syntax and shows the autocomplete on an empty line, a run shows step cards with stage pills and the green target circle on the before screenshot, and reloading with `?run=<id>` restores the run.
10. Kill Appium and start a session: the UI shows a clear error, not a hang.
