# Lane B - Run pipeline, console, quality  (owner: Simrit)

Read `CONTRIBUTING.md` and `docs/TRACKER.md` first. Update the tracker when you start and finish each task.

**Folders you may edit:** `web/src/console/`, `web/src/quality/`, `server/routes/run.ts`, `server/routes/analyze.ts`

**Start without waiting:** Build against the stubs: `server/routes/run.ts` already exports `getRun` and `getLatestRunFor`; the editor text comes from `useEditor().getValue()` (works now with plain Monaco); set `useWorkspace().setLastRun(result)` after a run. Test Judge0 from a scratch script first (P-B0).

Clock windows assume a 5:30 pm start. MUST tasks are the demo; SHOULD tasks only when the golden path is green on main.

## P-B0 - Judge0 hello-world  [SETUP, 1.0 h, 5:30 pm-6:30 pm]

Get Judge0 access (hosted key or any endpoint you can reach). From a scratch script submit `print(1)` and a stdin program, poll to completion, note the Python language id from /languages, check the daily quota. If hosted Judge0 is not working by 7:30 pm, switch to the local-subprocess fallback (section 7.3) and tell everyone.

**Done when:** A scratch script prints the stdout of a Python program run through Judge0, and the quota is written in the tracker.

**Blueprint tasks:** T-00-01, T-00-05

## P-B1 - Run pipeline  [MUST, 2.0 h, 6:30 pm-8:30 pm]

`server/routes/run.ts`: `POST /api/run` submits to Judge0 (base64, 5 s CPU, 128 MB, stdin), the server polls until done, stores the result, maps statuses (section 4.4). Exports `getRun` and `getLatestRunFor`; reads are allowed only for the owner or an active grantee via `canView`. Calls `logEvent`.

**Done when:** Hello-world and a stdin program return correct output; an infinite loop returns timeout; a SyntaxError returns compile_error with stderr.

**Needs:** P-B0

**Blueprint tasks:** T-B-01

## P-B2 - Console panel  [MUST, 1.5 h, 8:30 pm-10 pm]

Run button (Ctrl+Enter) sending the editor text, stdin box, stdout / stderr tabs, status badge with time and memory, last five runs, a 'only you can see this' lock. Sets `lastRun` in WorkspaceContext so Lane C can read it.

**Done when:** Three people run the same file with different stdin and each sees only their own output.

**Needs:** P-B1; editor text via EditorHandle (stub ok)

**Blueprint tasks:** T-B-02, T-B-03 (lite)

## P-B3 - Error line marking  [MUST, 0.5 h, 10 pm-10:30 pm]

Parse the Python traceback into `errorLine` and `errorMessage`; call `setMarkers` and `highlightLine`; clicking the error jumps to the line.

**Done when:** The off-by-one IndexError sample marks the correct line.

**Needs:** P-B2, P-A2 handle

**Blueprint tasks:** T-B-04 (lite)

## P-B4 - Quality analysis (Python, six rules)  [MUST, 1.0 h, 11:30 pm-12:30 am]

`server/routes/analyze.ts`, regex and indentation heuristics on the text: line over 100 chars, one-letter names, nesting deeper than 3, magic numbers, eval / exec / os.system, bare except. Panel groups findings by category, click jumps to the line, markers appear in the editor. Runs 1.5 s after typing stops.

**Done when:** The quality sample triggers formatting, naming, smell, complexity and security findings.

**Needs:** P-A2 handle

**Blueprint tasks:** T-C-04, T-C-05 (lite)

## P-B5 - More languages  [SHOULD, 1.0 h, 12:30 am-1:30 am]

Language selector for C, C++, Java, JavaScript with the Judge0 ids from /languages, compiler flags, and the Java class-name rewrite to Main.

**Done when:** Each language prints hello-world and reads stdin.

**Needs:** P-B1

**Blueprint tasks:** T-B-05

## Test hooks and shared data for Lane B (added after the first push)

Put these `data-testid` names on your UI (full contract: `docs/TESTIDS.md`): `run-panel` (console root, add it first), `stdin-input`, `run-button`,
`run-status` (with `data-status` = the RunStatus and `data-run-id`), `run-stdout`, `run-stderr`, `quality-panel`, `quality-finding`
(with `data-category` and `data-rule`). After a failed run call `useEditor().setMarkers(...)`.

Shared data you can use today: `SAMPLES` (9 programs with the exact expected status, error name and line), `fixtureRuns` (one RunResult per status),
`fixtureDiagnostics` (what your six rules should find in the `quality-smells` sample), `errorCategory(status, stderr)`. Judge0 reports a Python
SyntaxError as a runtime error: map stderr containing SyntaxError or IndentationError to `compile_error`. Run `npm run verify:samples`.
Check your keys with `npm run preflight`. Your steps in the demo test: G3 (private runs), G4 (error line), G7 (quality) in `npm run e2e:golden`.

