# UI test contract (data-testid)

`npm run e2e:golden` plays the whole demo with three browsers (mentor Asha, students Ravi and Mei). It finds your UI only through
the `data-testid` names below, so **put these exact names on your elements**. A step whose panel root is missing is reported as
SKIP ("not built yet"); once the root exists the step runs for real and fails loudly if a name below is missing or wrong.

Rules: names are exact and lower-case with hyphens; attributes are exact; more elements with extra testids are fine.
The panel root is how the test knows a panel is real and not the placeholder, so add it first.

## Lane B: Simrit (console and quality)

| data-testid | What it is | Required attributes / content |
|---|---|---|
| `panel-run` | root of the console panel | (presence marks the panel as built) |
| `stdin-input` | the stdin text box | fillable (`input` or `textarea`) |
| `run-button` | runs the current editor text | click starts a run |
| `run-status` | status badge of the latest run | `data-status` = the RunStatus value (`success`, `runtime_error`, `compile_error`, `timeout`, `memory_limit`, `service_error`, `queued`, `running`) and `data-run-id` = the run id. Text is human ("Runtime error") |
| `run-stdout` | stdout of the latest run | text content is the output |
| `run-stderr` | stderr of the latest run | text content |
| `panel-quality` | root of the quality panel | |
| `quality-finding` | one row per finding | `data-category` (formatting, naming, smell, complexity, security) and `data-rule` |

Error marking: after a failed run call `useEditor().setMarkers(...)`; the test looks for Monaco's `.squiggly-error` and
(optionally) `useEditor().highlightLine(n)`.

## Lane C: Rahil (AI)

| data-testid | What it is | Required attributes / content |
|---|---|---|
| `panel-ai` | root of the AI panel | |
| `explain-button` | "Explain with AI" for the latest run | |
| `explain-card` | the finished explanation | visible, with readable text (what / where / why / fix) |
| `patch-show` | "Show patch" | opens the diff preview |
| `patch-diff` | the diff preview | visible while open |
| `patch-accept` | Accept | applies via `useEditor().replaceAll(...)`; everyone's editor updates |
| `patch-reject` | Reject | closes the preview; the editor text must be exactly unchanged |

## Lane D: Miti (debug, progress, samples)

| data-testid | What it is | Required attributes / content |
|---|---|---|
| `panel-debug` | root of the debug panel | |
| `debug-request` | "Request access" button, one per person | `data-user` = that person's display name |
| `debug-incoming` | the prompt shown to the OWNER when someone asks | visible while a request is pending |
| `debug-allow` / `debug-deny` | the owner's two choices | |
| `debug-banner` | shown to the OWNER while someone is viewing | visible only while access is active |
| `debug-revoke` | the owner takes access back | inside `debug-banner` or next to it |
| `debug-mirror` | the VIEWER's read-only copy of the owner's latest run | contains the run's stdout/stderr text; removed or hidden as soon as access ends |
| `panel-progress` | root of the progress page | |
| `progress-observation` | one row per observation sentence | text such as "3 of 4 loop-boundary runs failed; retry recommended" |
| `samples-menu` | the Samples button in the top bar | click opens the list |
| `sample-<id>` | one item per sample | `<id>` is the id from `shared/samples.ts`, for example `sample-index-error`; click loads that program for everyone |

Server privacy (checked by the golden test through the API): `GET /api/run/<id>` returns 403 for anyone who is not the owner or
an active grantee, 200 for the owner and for an active grantee, and 403 again after revoke.

## Already provided by the shell (Lane A): do not rename

`topbar`, `room-code`, `copy-invite`, `topbar-people`, `editor-status`, `presence-strip` (children carry `data-presence="Name:state"`),
`data-topbar-presence="Name"` on avatars, `entry-card`, `entry-name`, `entry-code`, `entry-generated`, `entry-submit`,
`video-join`, `video-error`, `video-live`, `panel-crash` (+ `data-panel`). Tabs have role `tab` and the names Video, AI, Quality, Debug, Progress.
Dev-only: `window.__sv.editor` exposes the EditorHandle.

## Running it

```
npm run dev            # in one terminal
npm run e2e:golden     # prints PASS / SKIP / FAIL per demo step
npm run e2e:golden -- --strict   # demo morning: SKIP counts as a failure
```
