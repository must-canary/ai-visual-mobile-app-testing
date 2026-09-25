# Visual Mobile Automation Testing playground

A single-page web app for testing Android apps with plain-English steps. You upload an APK,
start an Appium session against a booted emulator, write steps like `Tap on Receive`, and run
them. Claude vision resolves each description to on-screen coordinates at run time — there are
no selectors, ids or XPaths anywhere in a script. A local-first history reuses earlier
resolutions so repeat runs need few or no vision calls.

## Requirements

- Node 20+
- MongoDB reachable on `mongodb://localhost:27017`
- Appium 3 with the `uiautomator2` driver, started manually:
  `appium --base-path /` on `http://127.0.0.1:4723`
- One Android emulator booted and listed by `adb devices`
- Android build-tools with `aapt2` (used to read the package name and launchable activity)
- Gemini or Anthropic API credentials for the vision layer

Appium 3 does not expose `GET /appium/sessions` unless started with
`--allow-insecure=session_discovery`; the app treats that call as best effort.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `VISION_PROVIDER` | Required. Set to exactly `gemini` or `anthropic`; this alone selects the provider. |
| `GEMINI_API_KEY` | API key used when `VISION_PROVIDER=gemini`. |
| `GEMINI_BASE_URL` | Optional Gemini API base URL. Default `https://generativelanguage.googleapis.com/v1beta`. |
| `ANTHROPIC_API_KEY` | API key used when `VISION_PROVIDER=anthropic`, sent as `x-api-key`. |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token. When set it takes priority over `ANTHROPIC_API_KEY` — use this for gateways that authenticate with `Authorization: Bearer`. |
| `ANTHROPIC_BASE_URL` | Base URL of an Anthropic-compatible endpoint. Leave empty for `api.anthropic.com`. |
| `ANTHROPIC_WORKSPACE_ID` | Sent as the `anthropic-workspace-id` header when the key is organization-level. Ignored unless it looks like an id (letters, digits, `_`, `-`). |
| `VISION_MODEL` | Required provider model used for locate and validate. Restart Next.js after changing it or `VISION_PROVIDER`. |
| `MONGODB_URI`, `MONGODB_DB` | Mongo connection. Default database `visualmbtesting`. |
| `APPIUM_URL` | Default `http://127.0.0.1:4723`. |
| `ANDROID_UDID` | Preferred device. Falls back to the first ready device from `adb devices`. |
| `ANDROID_HOME` | Android SDK root. Used to find `adb` and `aapt2` when they are not on `PATH`. |
| `AAPT2_PATH` | Explicit path to `aapt2`. Otherwise the newest build-tools version under `ANDROID_HOME` is used. |
| `LOCAL_FIRST_ENABLED` | Default state of the local-first switch. |
| `LOCAL_FIRST_SCREEN_DISTANCE` | Max Hamming distance between screen hashes for a cached entry to apply. Default 10. |
| `LOCAL_FIRST_PATCH_DISTANCE` | Max distance for the patch around the saved point. Default 6. |
| `LOCAL_FIRST_VALIDATE_DISTANCE` | Max screen distance for reusing a validation. Default 4. |
| `LOCAL_FIRST_MAX_MISSES` | A cache entry is deleted after this many misses. Default 2. |

## Step syntax

Everything is case-insensitive except the system commands, which must be uppercase.

| Step | Synonyms |
| --- | --- |
| `# comment` | never executed |
| `Tap on <description>` | `Tap`, `Tap the`, `Click`, `Press` |
| `Type "<text>" in <field>` | `into`, `on`; unquoted text allowed; `Type "<text>"` alone types into the focused field |
| `Validate that <condition>` | `Verify`, `Confirm`, `Check`, `Assert`, with or without `that` |
| `Scroll <up\|down\|left\|right>` | `Swipe`, `Drag`, `Slide` |
| `Scroll <dir> by <n>%` | as above |
| `Scroll <dir> until "<target>" is visible` | `till`, `untill` |
| `Wait Until <n> Seconds` | `wait 2s` |
| `OPEN_APP [package]` | launches the app under test when no package is given |
| `KILL_APP [package]` | terminate |
| `CLEAR_APP [package]` | clear app data |
| `MINIMISE_APP [package]` | `MINIMIZE_APP` |
| `PRESS_DEVICE_BACK_BUTTON` | |

Descriptions are resolved visually, in this priority order: exact visible text, icon by common
name, position in a list, relation to a neighbour, containment in a named section, visual
attribute.

## The five stages

Every step runs through the same pipeline, and each stage is reported to the browser over SSE
with its elapsed time and a detail string:

1. **capture** — screenshot through the session queue, saved as the step's before image and
   pushed into the device mirror.
2. **classify** — records which handler the step kind selected.
3. **locate** — for `Tap`, `Type ... in <field>` and `Scroll ... until`. Resolves the
   description to a point, from local history first when local-first is on, otherwise vision.
   Fails when nothing is found, confidence is below 0.6, or more than one candidate matches.
4. **act** — the gesture: tap, type (tap field, select-all, delete, type, read back, hide
   keyboard), swipe with the inverted direction, wait, or a `mobile:` app command.
5. **verify** — `Validate` steps call vision up to three times, 1.5 s apart, re-capturing
   between attempts. Action steps take an after screenshot once the screen has settled
   (700 ms, or 2500 ms after an app command).

## Local-first history

Every successful vision resolution is stored in `locate_cache`, keyed by app, step kind and the
lowercased description, together with a 64-bit difference hash of the screen and a hash of the
patch around the resolved point.

On a later run with local-first on, the ten most recent entries for that key are loaded. An
entry applies when the current screen hash is within `LOCAL_FIRST_SCREEN_DISTANCE` and the
patch around its saved point is within `LOCAL_FIRST_PATCH_DISTANCE`; the closest match wins and
counts as a local hit rather than a vision call.

After a cached tap or type, the engine checks that something actually changed — screen hash
first, then a doubled patch hash around the point; a successful read-back of typed text counts
as confirmation on its own. If nothing changed, the entry records a miss, vision re-resolves on
the current screen, and if the fresh point has moved more than 40 device pixels the action is
redone and the step is marked `healed`. Entries are deleted after `LOCAL_FIRST_MAX_MISSES`
misses.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server with Turbopack |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — parser, coordinate mapper, tokenizer, hashes |
| `npm run build` | production build |

## Notes on this build

- The vision client uses tool-calling for structured output rather than
  `client.beta.messages.parse` + `output_config`: the installed `@anthropic-ai/sdk` (0.68) does
  not ship `betaZodOutputFormat`, and tool-calling works against gateways as well as the
  first-party API. It retries once and then falls back to a plain JSON-only request.
- Long-lived objects (Appium sessions, run event buses, the Mongo client and the Anthropic
  client) live on `globalThis` so they survive hot reloads.
- APK uploads are streamed to `uploads/apks` by a small multipart reader, so a 300 MB APK never
  has to be buffered in memory.
- Sessions are in-memory only and an idle reaper closes any session unused for 15 minutes.
