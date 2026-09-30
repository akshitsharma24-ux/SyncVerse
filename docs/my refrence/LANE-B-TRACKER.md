# LANE B TRACKER - Simrit (private, local only)

> This file lives in `docs/my refrence/`, which is git-excluded on purpose (`.git/info/exclude`). It is NOT the team tracker.
> `docs/TRACKER.md` is Akshit's/the team's tracker: **do not edit it**. This file is Simrit's own tracker.
> Anyone (a new person or a new session) must be able to continue Lane B from THIS FILE ALONE, without asking questions.
> Rule: update this file after every step, and whenever work stops mid-step (fill in the RESUME HERE block).

---------------------------------------------------------------------------------------------------

## 1. RESUME HERE  (last updated: 2026-10-01, S9 in progress)

- **Current position:** S0-S8 DONE. **S9 (integration) is IN PROGRESS and going well.** Akshit already merged Lane B, Lane C (Rahil) and Lane D (Miti) into `main` (and made small integration edits in my console files, e.g. the run language follows the open file). Locally, `lane-b-simrit` was fast-forwarded to `origin/main` (10 commits ahead of `origin/lane-b-simrit`, NOT pushed; pushing it would only publish main's commits on this branch, ask Simrit first).
- **S9 verified on the merged code (2026-10-01):** typecheck 0 errors; Lane A smoke 8/8 and golden path (`npm run e2e:golden`) all PASS; Rahil's own checks (12 API, 7 browser) PASS; ALL my suites PASS (run 18, parse 32, analyze 33, langs API 26, console e2e 18, quality e2e 12, langs e2e 10). The AI panel reads my `lastRun`/errorLine correctly.
- **Lane C (Rahil) diagnosis, fixed by configuration only (her code is unchanged and correct):** her AI code uses Google GEMINI (Google's model service) via `LLM_API_KEY`. Causes of the "503" she reported: (1) no key on the machine; (2) the local `.env` still had model names left over from the first template; (3) `gemini-3.8-flash` is often overloaded at Google ("high demand", HTTP 503 even for a one-word prompt); (4) `gemini-3.1-pro-preview` has no quota on a free key (HTTP 429). Tested directly against Google: her structured-JSON request format is ACCEPTED (200). Working setup in the local git-ignored `.env`: `LLM_MODEL_FAST=gemini-3.1-flash-lite` and `LLM_MODEL_STRONG=gemini-3.1-flash-lite` (about 3 s per answer; `gemini-3.7-flash` / `3.5-flash` work but take 12-14 s, close to her 15 s timeout). Restart the API after editing `.env` (it is only read at startup). Live results through my run pipeline: explain ZeroDivisionError 200 in 3.5 s; patch KeyError 200 in 2.6 s; explain a Java ArrayIndexOutOfBounds 200 in 4.9 s with the right line. Quality note: flash-lite answers are fine but not perfect (e.g. a slightly wrong guard in one snippet); the headline off-by-one bug uses Rahil's exact OFFLINE answer and patch, so the demo does not depend on the LLM.
- **Next actions:** (1) ask Simrit whether to push the fast-forwarded branch (or keep lane-b separate); (2) tell Rahil/Akshit the `.env` model names to use (`.env.example` still lists gemini-3.8-flash / gemini-3.1-pro-preview, which fail on free keys; it is Rahil's/Akshit's file, so only tell them); (3) S9 leftovers: re-check Miti's debug grant reading a student's run through my routes (`canView`), now that her code is merged; (4) S10 demo readiness.
- **Built so far:** `server/routes/run.ts` (5 languages), `server/routes/analyze.ts`; `web/src/console/{index.tsx,useRunner.ts,markers.ts,language.ts,console.css}`; `web/src/quality/{index.tsx,quality.css}`. Tests in `scripts/`: `laneb-run.mjs` (18; `--local` for the fallback), `laneb-parse.mjs` (32), `laneb-analyze.mjs` (33), `laneb-langs.mjs` (26, real Judge0, needs internet), and the browser suites `laneb-console-e2e.mjs` (18), `laneb-quality-e2e.mjs` (12), `laneb-langs-e2e.mjs` (10) which need `npm run dev`.
- **Language facts (S8):** API `language` is `python | c | cpp | java | javascript`. `GET /api/run-info` -> `{runner, sandboxed, languages}` where `languages` is what THIS server can run: all five through Judge0; only `python` + `javascript` through the local runner (others get a 400 "not available on this server's demo runner"). Console language is per tab (`web/src/console/language.ts`, sessionStorage `sv.language`, hook `useLanguage()`); the quality panel is Python-only and steps aside (no requests, no markers) for other languages.
- **Run everything (copy/paste):** `npm run typecheck && npm run build`; `npm run smoke && npm run e2e && npm run e2e:entry` (Lane A's); then `node scripts/laneb-run.mjs && node scripts/laneb-run.mjs --local && node --import tsx scripts/laneb-parse.mjs && node --import tsx scripts/laneb-analyze.mjs && node scripts/laneb-langs.mjs && node scripts/laneb-console-e2e.mjs && node scripts/laneb-quality-e2e.mjs && node scripts/laneb-langs-e2e.mjs`. Last full run: all PASS.
- **Marker facts to remember (S5/S7 lessons):** the editor's red line band (`highlightLine`) is a TRACKED decoration that swells over the whole file when the text is replaced (AI patch / samples menu). So Lane B only ever FLASHES it (`flashLine`, run error 4 s, finding click 2.5 s) and keeps the lasting indicator as squiggle markers, which `revalidateRunMarker` (300 ms tick in `useRunner`) drops when the failing line changes and re-publishes when other text changes. Everything goes through `web/src/console/markers.ts`.
- **Observation for Akshit (Lane A shell, not mine):** at 390 px width the workspace gives the console column 0 px (the fixed 300+ px side dock takes the space); desktop and 820 px tablet are fine. Only matters if the demo is on a phone.
- **What S4 can rely on (RunResult fields the server now fills):** `status`, `stdout`, `stderr`, `compileOutput`, `timeMs`, `memoryKb`, and for failures `errorLine` (1-based, only when it is inside the program) + `errorMessage` (e.g. `IndexError: list index out of range`; for `timeout` the message is "Time limit exceeded (5 s). Check for an infinite loop." with NO errorLine; for `memory_limit` "Memory limit exceeded (128 MB)."). `service_error` runs carry the friendly reason in `stderr`. A run is `queued` -> `running` -> terminal; poll `GET /api/run/:id`. `GET /api/run-info` -> `{runner:'judge0'|'local', sandboxed, languages:['python']}`. Expected latency on the public Judge0: ~1.5-2.5 s (timeout case ~6.5 s). POST errors: 400 (bad input, body `{error}`), 401, 429 (`{error}` friendly text), all via `ApiError` (`err.status`, `err.body.error`).
- **Re-run the tests any time:** `node scripts/laneb-run.mjs` (Judge0) and `node scripts/laneb-run.mjs --local` (local runner) start their own servers on ports 4401-4403 (no `npm run dev` needed); `node --import tsx scripts/laneb-parse.mjs` for the parser.
- **Runner decision (S1):** hosted Judge0 = public instance `https://ce.judge0.com` (no key, set in `.env` as `JUDGE0_URL`; `JUDGE0_API_KEY`/`JUDGE0_API_HOST` are empty and must be sent only if non-empty). Verified working (see section 6). Still build the local-subprocess fallback behind the same `execute()` interface (the public instance has no SLA/quota guarantee; if it is down at demo time, the fallback is used and labelled "not sandboxed").
- **Push policy (Simrit, 2026-09-30):** she allows pushing this tracker and Lane B scripts/new files, ONLY to `origin/lane-b-simrit`. The tracker is git-excluded by `.git/info/exclude`, so it needs `git add -f "docs/my refrence/LANE-B-TRACKER.md"`. Do NOT push the reference PDFs (Simrit: they stay on her device); add only the tracker file by name. Lane B scripts go in `scripts/laneb-*.mjs` (new files only; never edit Lane A's existing scripts).
- **State of the machine right now:** `npm run dev` was started in the background (web http://localhost:5173, API http://localhost:4000). It stops when that session ends. To restart: `npm run dev` in the repo root. Check http://localhost:4000/api/health.
- **Git state:** on branch `lane-b-simrit`, identical to `origin/lane-a-akshit` and `origin/lane-b-simrit` = commit `2da8f44`. Working tree clean. Nothing committed by Simrit yet.

---------------------------------------------------------------------------------------------------

## 2. Onboarding facts (read once)

**Project:** SyncVerse, collaborative real-time code editor for remote STEM education (PS 02). Hackathon: HackConquest 2026, team HCQ_A01 (leader Miti Shah). Goal: a working prototype demo. Reference PDFs are in this folder (`PS 02.pdf`, `SyncVerse_Overnight_Prototype_Plan.pdf`, `SyncVerse_Master_Blueprint.pdf`, `HACKCONQUEST HACKATHON_.pptx.pdf`).

**Simrit = Lane B, working alone on the whole lane.** Branch: `lane-b-simrit`. Push ONLY to `origin/lane-b-simrit`. Never force-push. Never commit `.env`. Never touch other lanes' folders.

| Lane | Owner | Folders |
|---|---|---|
| A | Akshit | web/src/editor, video, server/collab.ts, routes/livekit.ts, shell files |
| **B** | **Simrit** | **`web/src/console/`, `web/src/quality/`, `server/routes/run.ts`, `server/routes/analyze.ts`** |
| C | Rahil | web/src/ai, server/routes/ai.ts |
| D | Miti | web/src/debug, progress, demo, server/routes/debug.ts, events.ts, docs samples |

**Files Lane B owns (and nothing else):**
- `server/routes/run.ts` (stub now; must keep exports `getRun(id)`, `getLatestRunFor(ownerId)`, and `export const router`)
- `server/routes/analyze.ts` (stub now; `export const router`)
- `web/src/console/index.tsx` (stub now; must keep `export function RunPanel` + default export, used by App.tsx). May add sibling files in `web/src/console/`.
- `web/src/quality/index.tsx` (stub now; must keep `export function QualityPanel` + default export). May add sibling files in `web/src/quality/`.
- Private: this folder `docs/my refrence/`.
- Test scripts (decision pending, see Open Questions): standalone `scripts/laneb-*.mjs`.
- `App.tsx` and `server/index.ts` already mount everything. **Never edit them**, nor `shared/types.ts`, `session.tsx`, `api.ts`, `identity.ts` (Lane A's; ask via group chat).

**Contracts Lane B must honour (from `shared/types.ts`, imported as `@syncverse/shared`):**
- `RunStatus = queued | running | success | compile_error | runtime_error | timeout | memory_limit | service_error`
- `RunRequest { roomCode, language, source, stdin }`
- `RunResult { id, ownerId, roomCode, language, source, stdin, status, stdout, stderr, compileOutput, timeMs?, memoryKb?, errorLine? (1-based), errorMessage?, createdAt }`
- `Diagnostic { category: formatting|naming|smell|complexity|security, severity: info|warning|error, line (1-based), col?, rule, message }`
- `EditorHandle { getValue(), replaceAll(text), setMarkers([{line,message,severity}]), highlightLine(line|null) }` (there is NO change-subscription and NO reveal-line; see Risks).
- Web hooks (`web/src/session.tsx`): `useEditor()`, `useWorkspace()` -> `{lastRun, setLastRun}` (Lane B MUST call `setLastRun(result)` after every finished run; Lane C/D read it), `useSessionUser()`, `usePresence()`.
- Web HTTP: always `api.get/post` from `web/src/api.ts` (adds identity headers). Types of errors: `ApiError` with `.status` and `.body`.
- Server: identity is a trusted header (`x-user-id`, `x-user-name`, `x-role`); `req.user` set by `identity` middleware; use `requireUser` from `../identity` as a route guard.
- Cross-lane server functions (exist as stubs, real versions come from Lane D; **import, never edit**):
  - `logEvent(e: LearningEvent)` in `server/routes/events.ts`, call after every finished run (`type:'run'`, `category` = error kind or 'success', `ok`, optional `concepts`).
  - `canView(viewerId, ownerId)` in `server/routes/debug.ts`, use for reads of another user's run.
- **Privacy rule:** a run is readable ONLY by its owner or an active grantee (`canView`). Others get 403.
- Endpoints Lane B provides: `POST /api/run {roomCode,language,source,stdin} -> {id}`; `GET /api/run/:id -> RunResult` (owner/grantee else 403, unknown 404); `GET /api/runs/latest?ownerId= -> RunResult | null` (owner/grantee); `POST /api/analyze {source} -> Diagnostic[]`.

**Look and feel (web panels):** warm paper, ink black, hairline frames. Use CSS variables from `web/src/index.css`, never hard-coded colours: `var(--paper) --panel --ink --muted --rule-soft --danger --ok --warn`. Red ONLY for errors. Classes: `btn`, `btn btn-outline`, `btn-sm`, `btn-block`, `input` / `input code`, `field`, `seg`, `eyebrow`, `mono`, `panel`, `panel-head`. Icons: `<Icon name="..."/>` from `web/src/shell/icons.tsx`. The panel renders inside an already-padded, bordered container: do not add another outer card. Do NOT use Tailwind `hidden` on styled elements (our unlayered CSS beats it); use conditional rendering or `hide-sm`/`hide-md`. Keep/add `data-testid` hooks.

**Conventions:** TypeScript strict; `npm run typecheck` must pass before each commit. React StrictMode is OFF on purpose. Server is CommonJS via `tsx`, web is ESM via Vite. State in server memory (resets on restart). Comments short and useful. Commit messages start with the task ID (e.g. `P-B1: poll Judge0 until done`).

**How to run:** `npm install` (done) -> `.env` exists (copied from `.env.example`, git-ignored) -> `npm run dev` (web 5173, API 4000). Health: `http://localhost:4000/api/health` (shows `configured.judge0` true/false). Two users on one laptop = two TABS (session is per tab). Shortcut URL: `http://localhost:5173/?name=Asha&role=student&room=loops-101`.

**Verification commands (existing, from Lane A):** `npm run typecheck`, `npm run build`, `npm run smoke` (8 checks, needs dev server), `npm run e2e` (13 checks, Edge via playwright-core), `npm run e2e:entry`, `npm run e2e:video`, `npm run e2e:reconnect`, `npm run test:persist`.

**Useful fact:** the editor's starter program in every new room (`STARTER` in `server/collab.ts`) IS the golden-path IndexError sample:
```python
def average(nums):
    total = 0
    for i in range(len(nums) + 1):
        total += nums[i]
    return total / len(nums)


print(average([3, 4, 5]))
```
Expected: `IndexError: list index out of range` at **line 4** (`total += nums[i]`). This is the required S3/S5 test.

**Environment:** Windows 11, Node v24.12.0, npm 11, Python 3.14.2 (`C:\Users\simri\AppData\Local\Python\bin\python`), git config `core.autocrlf=input` (set in S0). Bash tool + PowerShell both available; PowerShell was more reliable for npm/git per Lane A notes.

---------------------------------------------------------------------------------------------------

## 3. Status board (Lane B steps)

Status values: TODO, DOING, DONE, BLOCKED. "Plan ID" = task ID in the overnight plan / lane file (`docs/lanes/LANE-B.md`).

| Step | Plan ID | Tier | What | Status | Depends on |
|---|---|---|---|---|---|
| S0 | (P-B0 prep) | SETUP | Branch sync, local exclude, install, baseline checks, this tracker | **DONE** | - |
| S1 | P-B0 | SETUP | Judge0 hello-world (scratch script), pick runner, note quota | **DONE** | S0 |
| S2 | P-B1 | MUST | Run pipeline `server/routes/run.ts` (POST/GET, statuses, privacy, events, rate limit) | **DONE** (16/16 Judge0, 16/16 local) | S1 |
| S3 | (P-B1/B3) | MUST | Python traceback parser -> errorLine/errorMessage (in run.ts) | **DONE** (16/16 unit, 18/18 Judge0, 18/18 local) | S2 |
| S4 | P-B2 | MUST | Console panel (Run, Ctrl+Enter, stdin, tabs, badge, last 5, lock, setLastRun) | **DONE** (12/12 three-user e2e) | S2 (S3 for error rows) |
| S5 | P-B3 | MUST | Error line marking + click to jump | **DONE** (16/16 console e2e) | S3, S4 |
| S6 | P-B4 | MUST | Quality analysis server `analyze.ts` (six rules) | **DONE** (31/31) | S0 |
| S7 | P-B4 | MUST | Quality panel (grouped, click-to-jump, markers, 1.5 s debounce) | **DONE** (12/12 browser) | S6, S5 (marker merge) |
| S8 | P-B5 | SHOULD | More languages: C, C++, Java, JavaScript | **DONE** (26/26 live API, 10/10 browser, 32/32 parser) | S2-S5 green |
| S9 | - | - | Integration + hardening + full regression + edge cases | TODO | S2-S7 |
| S10 | - | - | Demo readiness, final report, push | TODO | S9 |

Order of work: S0 -> S1 -> S2 -> S3 -> S4 -> S5 -> S6 -> S7 -> (S8 only if golden path green) -> S9 -> S10.
(S6 has no dependency on S1-S5; if Judge0 access stalls, S6/S7 can be built first, since the quality analyzer is a pure function.)
Cut ladder for Lane B if time runs short (plan 2.3): drop B5 first; then lint 6 rules -> 3 rules. NEVER cut B1-B3 (run + error line).

---------------------------------------------------------------------------------------------------

## 4. Step details: DONE / LEFT / test

### S0 - Setup and safety  -> DONE (2026-09-30)
DONE:
- [x] Read all 4 reference PDFs, the project rules file, `docs/TRACKER.md`, `docs/lanes/LANE-B.md`, all Lane B stubs, shared contracts, server shell, `api.ts`, `session.tsx` hooks.
- [x] `git fetch origin`; verified `origin/lane-a-akshit` = `origin/lane-b-simrit` = `2da8f44` (Lane A has nothing newer). Local branch `lane-b-simrit` created tracking `origin/lane-b-simrit`.
- [x] `git config core.autocrlf input` set for this repo.
- [x] `docs/my refrence/` added to `.git/info/exclude` (local-only). `git status` is clean (0 entries).
- [x] `.env` created from `.env.example` (git-ignored, confirmed by `git check-ignore`). Judge0 vars still empty.
- [x] `npm install` OK (230 packages, 0 vulnerabilities).
- [x] `npm run typecheck` clean (server and web).
- [x] `npm run dev` started; `/api/health` OK directly and via the Vite proxy (`configured: {judge0:false, llm:false, livekit:false}`); `POST /api/run` -> 501 `{"task":"P-B1"}`; `POST /api/analyze` -> 501 `{"task":"P-B4"}` (baseline stubs confirmed).
- [x] `npm run smoke` -> 8/8 PASS.
- [x] This tracker created.
LEFT: nothing.
Notes: nothing was committed. No product code touched.

### S1 - P-B0 Judge0 hello-world  -> DONE (2026-09-30)
DONE:
- [x] Scratch script (outside the repo, in a scratch folder; `judge0-hello.mjs`, `conc.mjs`) ran against `https://ce.judge0.com`: `print(1)` -> `1`; stdin program (`21`) -> `42`; the IndexError starter, SyntaxError, NameError and infinite loop all behave as expected (raw results in section 6).
- [x] `GET /languages` read; ids recorded (section 6). Three simultaneous runs with different stdin returned their own outputs; a burst of 12 concurrent runs all Accepted (no throttling seen).
- [x] Decision: use the public Judge0 (no key) as the primary runner; keep a local fallback behind one `execute()` interface (D3, D8).
LEFT (carried into S2): none for S1. The quota of the public instance is unknown (no rate-limit headers); handle 429/5xx gracefully in S2.
Original plan for reference:
DO:
1. Write a throwaway script in a scratch dir (NOT in the repo, or under repo only if git-ignored): submit `print(1)`; submit a program that reads stdin (e.g. `print(int(input())*2)` with stdin `21` -> `42`). Use `base64_encoded=true`, `wait=false`, then poll `GET /submissions/{token}?base64_encoded=true` every 500 ms (give up at 15 s). RapidAPI headers: `x-rapidapi-key`, `x-rapidapi-host`. Plain instance: no headers (or `X-Auth-Token` if configured).
2. `GET /languages`: record ids for Python 3, C (GCC), C++ (GCC), Java, JavaScript (Node). Expected on CE 1.13: 71, 50, 54, 62, 63. Newer builds renumber: map by NAME at runtime.
3. Check quota (RapidAPI response headers `x-ratelimit-requests-remaining` etc.). Write the daily limit in section 6 below.
4. Test the three status cases through Judge0: infinite loop (`while True: pass`) -> status 5 (Time Limit Exceeded); `print(` -> Python reports SyntaxError as a runtime error (status 11/other), our rule maps it to `compile_error`; `print(undefined_var)` -> runtime error.
5. DECISION POINT: hosted Judge0 works? -> use it. Not by the deadline / over quota -> local subprocess fallback (plan 7.3). Design S2 with ONE `execute()` interface and two implementations picked by env (`JUDGE0_URL` set -> Judge0, else local). Local runner must be labelled "demo runner, not sandboxed" in UI/logs and must never be described as sandboxed.
DONE WHEN: a script prints the stdout of a Python program run through the chosen runner AND the quota is written in section 6 of this file.
LEFT: everything.

### S2 - P-B1 Run pipeline  -> DONE (2026-09-30)
DONE (all in `server/routes/run.ts`, no other repo file edited; exports `getRun`, `getLatestRunFor`, `router` kept, plus `errorKind`, `mapJudge0Status`):
- [x] `POST /api/run` (requireUser, zod): 400 for bad body / no code / oversize (source 100k chars, stdin 10 KB) / unsupported language (only `python` until S8); 429 for rate limit; 202 `{id}` at once, run continues in the background.
- [x] Judge0 runner: language id read by name from `/languages` once (Python 3.12 preferred; failure not cached); base64; cpu 5 s, wall 10 s, memory 128 MB; poll 500 ms; 15 s give-up -> `service_error`; 8 s timeout per HTTP call; 429/5xx/network -> `service_error` with a friendly message. Key headers sent only if set.
- [x] Local fallback runner (`RUNNER=local`, or `JUDGE0_URL` empty): `python -X utf8 -I script.py` in a temp dir, 5 s kill, secrets NOT passed in its env (tested), reported as `sandboxed:false`. Judge0 failures never silently fall back to it.
- [x] Status mapping: 3 success, 5 timeout, 6 compile_error, 7-12 runtime_error (SyntaxError/IndentationError/TabError in stderr -> compile_error; MemoryError or peak >= 95% of 128 MB -> memory_limit), 13/14/other -> service_error.
- [x] Output caps: stdout head 64 KB + "[output truncated]"; stderr/compile output tail 16 KB; CRLF normalised.
- [x] `GET /api/run/:id` (404 unknown, 403 unless owner or `canView`), `GET /api/runs/latest?ownerId=` (default caller; same rule; `null` if none), `GET /api/run-info` -> `{runner:'judge0'|'local', sandboxed, languages}` (my own extra route; the console can show the "not sandboxed" label from it).
- [x] Rate limits (env-tunable): 1 run / 2 s (`RUN_MIN_INTERVAL_MS`), 30 per 10 min (`RUN_MAX_PER_10_MIN`; blueprint says 20, raised to 30 so demo rehearsals do not hit it), max 2 in flight per user. Runs kept in memory, last 200 per user.
- [x] `logEvent({type:'run', category, ok})` on completion: category = `success` | `timeout` | `memory_limit` | exception name (e.g. `IndexError`) | status. `service_error` runs are NOT logged (not a learning event).
- [x] Crash safety: background job catches everything; `.finally()` releases the in-flight counter.
- [x] Tests: `scripts/laneb-run.mjs` 16/16 with Judge0 (hello, stdin, unicode, timeout, SyntaxError, NameError, IndexError, 64 KB truncation, 3 users isolated, privacy 403/404/null, 400s, in-flight cap, 429, Judge0-down -> service_error + server alive) and 16/16 with `--local`. `npm run typecheck` clean.
LEFT for this step: nothing. (`errorLine`/`errorMessage` are S3; `language` other than python is S8.)
NOTE: `canView` is still Lane D's owner-only stub, so "active grantee can read" is untested until D pushes (S9).
Original plan for reference:
- `POST /api/run` (guard `requireUser`): zod-validate `{roomCode: string, language: string (default 'python'), source: string (<= ~100 KB), stdin: string (<= 10 KB, default '')}`; bad input -> 400. Create RunResult `status:'queued'`, `ownerId = req.user.userId`, uuid id, `createdAt`; return `{id}` immediately; execute in the background.
- Judge0 submission: base64 source + stdin, `cpu_time_limit 5`, `wall_time_limit ~10`, `memory_limit 131072` (KB), Python id (read by name). Poll 500 ms; after 15 s -> `service_error` with a retry message.
- Status mapping (plan 4.4 / blueprint App. B): 1,2 -> `running`; 3 -> `success` (we send no expected output, so 3 = finished cleanly); 5 -> `timeout`; 6 -> `compile_error` (message is in `compile_output`); 7-12 -> `runtime_error`, or `memory_limit` if peak memory is at the 128 MB limit; 13,14 -> `service_error`; ANY status whose stderr contains `SyntaxError` or `IndentationError` -> `compile_error` (Python reports them at run time). Status 4 (wrong answer) is never used.
- Caps: stdout <= 64 KB (append a "[output truncated]" note), stdin <= 10 KB. Strip `\r`.
- Fill `stdout, stderr, compileOutput, timeMs (seconds*1000), memoryKb`.
- `GET /api/run/:id`: 404 if unknown; 403 unless viewer is owner or `canView(viewer, owner)`; else the RunResult.
- `GET /api/runs/latest?ownerId=` (default = caller): same guard; returns the latest RunResult or JSON `null`.
- On completion call `logEvent({userId, roomCode, at, type:'run', category, ok, concepts?})`. `category`: `'success'` or the Python exception name (IndexError, NameError, SyntaxError, RecursionError...) or `'timeout'`, `'compile_error'`. Lane D maps these to concepts; do not do their mapping.
- Per-user rate limit ~1 run / 2 s and 20 / 10 min -> 429 with a friendly message. Memory bound: keep last ~200 runs per user (evict oldest).
- Crash safety: the background job must catch everything (an unhandled rejection can kill the server). Never log the API key.
- Keep `getLatestRunFor(ownerId)` semantics (latest by `createdAt`).
TESTS (write `scripts/laneb-run.mjs`, decision pending): hello-world; stdin program (`21` -> `42`); infinite loop -> `timeout`; `print(` -> `compile_error` with stderr; `print(x)` NameError -> `runtime_error`; user B cannot GET user A's run (403); unknown id 404; no `x-user-id` -> 401; oversize stdin/source -> 400; rate limit -> 429; server keeps running after a Judge0 failure (simulate bad URL).
DONE WHEN (plan): hello-world and a stdin program return correct output; an infinite loop returns timeout; a SyntaxError returns compile_error with stderr.
LEFT: everything.

### S3 - Error parsing  -> DONE (2026-09-30)
DONE (all in `server/routes/run.ts`; new exports `parsePythonError(stderr, source)`, `errorKind(stderr)`, `mapJudge0Status` for tests):
- [x] `exceptionLine()`: last unindented `Name: message` line (skips `Traceback`, `During handling`, `The above exception`, `[...]` notices, and indented frame/caret lines). Works for custom exceptions too (no "Error" suffix needed).
- [x] `parsePythonError`: takes frames only from the LAST `Traceback (most recent call last):` block (so chained exceptions use the final one), keeps the last `File ".../script.py", line N` frame whose file basename is `script.py` (Judge0 `/box/script.py`, local Windows temp path, or bare `script.py`); ignores `<string>`, stdlib and caret (`^^^`, `~~~`) lines; drops a line number that is outside the program (never a wrong marker); handles CRLF source; SyntaxError/IndentationError (no Traceback header) work.
- [x] `annotateError()` runs in `processRun()` before `logEvent`: sets `errorLine`/`errorMessage` for `runtime_error` and `compile_error`; `timeout` and `memory_limit` get a message only (no line); success/service_error get nothing.
- [x] Tests: `scripts/laneb-parse.mjs` 16/16 (py 3.8 and 3.12 formats, SyntaxError, IndentationError, NameError with hint, RecursionError with repeated frames, chained exceptions, stdlib frame, Windows path, out-of-range line, `<string>` frames, empty/truncated stderr, CRLF, status mapping table). `scripts/laneb-run.mjs` now 18/18 on Judge0 and 18/18 local, including REAL runs: IndexError starter -> errorLine 4 and message `IndexError: list index out of range`; NameError -> 2; SyntaxError -> 1; RecursionError -> 2; timeout -> no line + infinite-loop message; success -> no error fields. Typecheck clean.
LEFT: parsers for C/C++/Java/JavaScript (gcc `file:LINE:COL: error:`, javac `Main.java:LINE: error:`, Node stack) belong to S8.
Bug found while testing: none in the parser; one test-script slip (a multi-line string literal from a bad patch) fixed.
Original plan for reference:
In `server/routes/run.ts`. Parse Python tracebacks into `errorLine` + `errorMessage`.
- Find the LAST `File "<...script.py>", line N, in ...` frame that belongs to the user's program (skip `<frozen ...>` and stdlib paths); `errorMessage` = the final exception line (e.g. `IndexError: list index out of range`).
- SyntaxError/IndentationError: line from the `File "...", line N` header; message = last line (`SyntaxError: expected ':'`, etc. Python 3.10+ wording varies; do not depend on exact text).
- RecursionError: the frame is repeated hundreds of times; take the last user frame; keep message short.
- Set only when status is a failure; leave undefined on success. `errorLine` must be within 1..number of source lines, else drop it.
- (Other languages' parsers come in S8.)
TESTS: five planted programs (see section 7): IndexError starter -> line 4; NameError -> the line with the misspelt name; SyntaxError missing colon -> the line of the `def/if/for`; infinite loop -> no errorLine; RecursionError -> the recursive call line.
DONE WHEN: the IndexError sample gives `errorLine === 4`; the SyntaxError sample gives the right line.
LEFT: everything.

### S4 - P-B2 Console panel  -> DONE (2026-09-30)
DONE (files: `web/src/console/index.tsx` UI, `useRunner.ts` logic, `console.css` styles; nothing outside Lane B edited):
- [x] Run button + Ctrl/Cmd+Enter. The shortcut is a window-level CAPTURE listener so Monaco does not insert a newline; it fires only when focus is in the editor, in the console, or nowhere (other panels keep their own shortcuts). Button and shortcut are ignored while a run is in flight (`busyRef`), so double presses send one request.
- [x] Sends `editor.getValue()` + stdin to `POST /api/run` (language python), polls `GET /api/run/:id` every 400 ms (5 consecutive failures, 404/403, or 45 s -> a notice), then `setLastRun(result)` for EVERY finished run (also service_error). Old runs selected from history do not change `lastRun`.
- [x] stdin textarea (kept per room in sessionStorage), badge (Queued/Running with seconds/Success/Compile error/Runtime error/Timeout/Memory limit/Service error; ok=green, errors=red, timeout/memory=amber, service=grey), time + memory, Output / Errors tabs (Errors auto-opens for failures and shows a dot when there is content), error row with message + `line N` button (calls `highlightLine`), last five runs (click to view; time + colour dot), notices for 400/401/429/501/network, "not sandboxed" warning from `/api/run-info` when the local runner is used, empty state text, dimmed old output while a new run is in flight.
- [x] On load / page refresh it fetches `/api/runs/latest` and restores the last run (or resumes following a run still in progress) and sets `lastRun`.
- [x] The shell's console header already shows "only you can see your runs" with a lock; not duplicated.
- [x] `data-testid`: `run-panel, run-btn, stdin-input, run-status (data-status, data-run-id), run-meta, run-stdout / run-stderr (the visible output pane), tab-stdout, tab-stderr, run-error, run-error-line, run-notice, run-unsandboxed, run-history, run-history-item`.
- [x] Tests: `node scripts/laneb-console-e2e.mjs` (needs `npm run dev`; optional `E2E_SHOTS=<dir>` writes screenshots and adds a tablet-width check) 12/12: three users, different stdin, each sees only own output; badge/time/memory/history; privacy 403 from another browser; Ctrl+Enter runs without editing the text; failing run shows Runtime error + IndexError + `line 4`; syntax error shows Compile error; whitespace-only shows a notice and starts nothing; two quick Ctrl+Enter = one run (no 429 notice); reload restores the latest run; Ben's run never appears in Cy's console; tablet 820 px works with no sideways scroll. Regression: typecheck clean, `npm run build` OK, `npm run smoke` 8/8, `npm run e2e` 13/13, `npm run e2e:entry` 11/11. Screenshots checked by eye at 1100 and 820 px.
LEFT: markers on the editor and jump-to-line behaviour beyond `highlightLine` = S5. Language selector = S8.
Notes: a phone-width (390 px) check was dropped because the Lane A shell gives the console 0 px there (see RESUME).
Original plan for reference:
DO:
- Run button and Ctrl+Enter (must not break typing in Monaco; only trigger when focus is in the workspace). Reads `editor.getValue()`, posts `api.post('/api/run', {roomCode: me.roomCode, language:'python', source, stdin})`, polls `GET /api/run/:id` every ~400 ms until status is terminal (`success | compile_error | runtime_error | timeout | memory_limit | service_error`), then `setLastRun(result)`.
- UI: stdin textarea (`input code`), status badge (green ok, red for compile/runtime error, amber timeout/memory, grey service_error, blue running), time and memory, tabs `stdout` / `stderr` (compile output shown with stderr), "Only you can see this" lock line, last 5 runs list (click shows that run), error row (message + line) for failed runs (click handled in S5). Disable Run while running (also block double-click). Friendly messages for 429, 401, 501, network errors. Clear polling timers on unmount.
- Do NOT build "Explain with AI" (Lane C reads `lastRun` and adds it). Do not add an outer card.
- `data-testid`: `run-btn`, `stdin-input`, `run-status`, `run-stdout`, `run-stderr`, `run-history`, `run-error`.
TESTS: e2e with three real sessions (Edge/playwright-core like Lane A's scripts): each runs the same file with a different stdin and sees ONLY its own output; screenshot for layout at desktop and 390 px.
DONE WHEN (plan): three people run the same file with different stdin and each sees only their own output.
LEFT: everything.

### S5 - P-B3 Error line marking  -> DONE (2026-09-30)
DONE (new `web/src/console/markers.ts`; edits in `useRunner.ts`, `index.tsx`, `console.css`, and one server tweak in `run.ts`):
- [x] `markers.ts`: `publishMarkers(editor, 'run'|'lint', markers)` keeps both sources and calls `setMarkers` once with the merge (decision D5 implemented); `clearRunMarkers`; `markRunError(editor, run)`.
- [x] A failed run with `errorLine` + `errorMessage` -> red marker (squiggle) + line highlight + scroll into view (Lane A's `highlightLine` already reveals, so no request to Akshit is needed; R3 closed). Marker is cleared when a new run is accepted by the server and on a successful/no-line run (timeout has no line). The markers are also removed when the panel unmounts (leaving the room).
- [x] Safety: a marker is shown only if that line has the same text in the editor as in the text that was run, so a collaborator editing the failing line meanwhile never causes a wrong-line marker (tested).
- [x] Reload: `/api/runs/latest` restores the run and the marker, waiting up to 6 s for the editor text to arrive first (bug found by the test: restoring before the editor synced silently skipped the marker; fixed with `markWhenEditorReady`).
- [x] Clicking the error row OR its `line N` button jumps back to the line (tested with a 95-line file scrolled to the bottom).
- [x] Layout fixes found in screenshots: (1) error row moved ABOVE the output so it is always visible; (2) output pane scrolls inside the console instead of growing (wrapping flex could not constrain height; now a CSS grid + container query: two columns when the console is wider than 560 px, stacked below); (3) last-runs chips moved into the tabs row; (4) removed Judge0's generic "Exited with error status 1" line from the Errors tab (server: compile_output only).
- [x] Files formatted with prettier (single quotes, width 130) to match Lane A's style; the repo itself has no prettier config.
- [x] Tests: `laneb-console-e2e.mjs` 16/16 (adds: highlight + squiggle on the line containing `total += nums[i]`; jump back after scrolling away; reload restores marker; success clears it; no marker after a concurrent edit of the failing line). Regression: typecheck clean, build OK, smoke 8/8, e2e 13/13, e2e:entry 11/11, laneb-run 18/18 (Judge0) and 18/18 (local), laneb-parse 16/16. Screenshots reviewed at 1300 and 820 px.
- Cross-lane confirmation: Lane C's placeholder AI panel already displays `last run: runtime_error (line 4)`, so `setLastRun` reaches other lanes.
LEFT: nothing for S5.
Original plan for reference:
DO: on a failed run with `errorLine`, call `editor.setMarkers([{line, message, severity:'error'}])` and `editor.highlightLine(errorLine)`; the console error row is clickable and calls `highlightLine(errorLine)` again (jump). On the next run start or on success: clear the run marker and the highlight.
Risk R2: `setMarkers` replaces ALL markers, and the quality panel (S7) also uses it. Solve with one tiny shared module inside Lane B's folders (e.g. `web/src/console/markers.ts`) that keeps `runMarkers` and `lintMarkers` separately and calls `setMarkers(merge)` once. Build it now so S7 reuses it.
Risk R3: if `highlightLine` alone does not scroll the line into view, do NOT edit Lane A's code: write a note in section 8 and ask Akshit (via the group chat) for a `revealLine` on `EditorHandle`.
TESTS: starter program run -> marker + highlight on line 4, clicking the error row keeps/re-applies it; a second successful run clears it.
DONE WHEN (plan): the off-by-one IndexError sample marks the correct line.
LEFT: everything.

### S6 - P-B4 Quality analysis (server)  -> DONE (2026-09-30)
DONE (`server/routes/analyze.ts`, exports `analyze(source)` and `router`; nothing else edited except the tracker):
- [x] `POST /api/analyze` (zod, source <= 100,000 chars, 400 otherwise) -> `Diagnostic[]`, sorted, capped at 200.
- [x] Approach: a small scanner blanks string contents and comments (same line numbers and columns, quotes kept, triple-quoted strings and escapes handled, unterminated strings end at the line end), then rules run on the blanked text; multi-line statements (open brackets / backslash) are joined into logical lines. So `"eval(x)"`, numbers or `except:` inside strings, docstrings and comments never trigger (tested).
- [x] Rules and exact behaviour:
  - `line-too-long`: raw line > 100 characters (comments and strings count), col 101.
  - `one-letter-name`: single-letter assignment targets (tuple, augmented, annotated), function names and parameters (also on multi-line `def`). Exempt: `for`/comprehension variables, `with ... as f`, `_`, attributes (`self.x`), keyword arguments. Reported once per name (first use). `l`, `O`, `I` get a "looks like 1 or 0" message.
  - `deep-nesting`: a control block (if/elif/else/for/while/try/except/finally/with) at level > 3; counted inside the current function/class only; tabs expand to 4; one-line `if x: y` is not a block. Each too-deep opener line is reported.
  - `magic-number`: numbers used in arithmetic/comparison (`* 86400`, `> 18`, `% 15`, `* 3.14159`, `-= 50`). Not flagged: whole numbers 0-10 and 0.5 (so FizzBuzz `% 3` and `/ 2` are quiet), plain data (`[3, 4, 5]`, `x = 42`), unary minus, `NAMED_CONSTANT = 100`, default arguments.
  - `bare-except`: `except:` with no type.
  - `nested-loops` (complexity): a for/while inside another loop in the same function; message says roughly n x n (O(n^2)); depth 3+ says "n to the power 3".
  - `dangerous-call` (security): `eval(`/`exec(` = error (not `obj.eval()` and not `def eval`); `os.system(`, `subprocess... shell=True`, `pickle.load(s)` = warning.
  - `hardcoded-secret` (security, warning): `password/secret/api_key/token = "literal"`; not env lookups, not in comments.
- [x] Tests `node --import tsx scripts/laneb-analyze.mjs` 31/31: the plan sample gives all five categories (`one-letter-name@2, nested-loops@4, magic-number@5, dangerous-call@10, line-too-long@11`); the room starter (IndexError sample) and clean code give ZERO findings; false-positive traps; each rule both ways; CRLF; tabs; multi-line def; broken code never throws; cap 200 + sorted; 100,000-char line and binary junk in 15 ms; 5,000 lines in ~16 ms; the HTTP endpoint (shape, 400s, empty -> []).
- Realistic programs eyeballed (FizzBuzz, class, fib, grades, bubble sort, a deliberately bad program): no noise on good code; bubble sort gets the O(n^2) note. One tuning decision came from this: small whole numbers 0-10 are exempt from `magic-number` (FizzBuzz would otherwise show 3 pedantic findings).
- Not done on purpose: `LearningEvent` type `'lint'` is NOT logged (the panel would spam it on every keystroke pause). Decide in S7 whether to log only on the explicit "Analyze now" button (needs a tiny `POST /api/analyze?log=1`-style hook; Lane D has not asked).
LEFT: nothing for S6. The five-dimension maintainability summary (blueprint) is optional for S7.
Original plan for reference:
File: `server/routes/analyze.ts`. `POST /api/analyze {source}` -> `Diagnostic[]` (zod, source cap ~100 KB, sorted by line, cap ~200 findings, pure function, fast).
Six rules (Python, regex + indentation heuristics; strip strings and comments before pattern matching to avoid false positives; use the ORIGINAL line numbers):
1. `line-too-long`  formatting, warning: line over 100 chars.
2. `one-letter-name`  naming, info: single-letter variable/function/parameter names, except loop counters `i j k` in `for` targets and `_`.
3. `deep-nesting`  smell, warning: indentation depth greater than 3 levels of blocks.
4. `magic-number`  smell, info: numeric literals other than 0, 1, -1, 2 (and not in an ALL_CAPS constant assignment).
5. `dangerous-call`  security, error/warning: `eval(`, `exec(`, `os.system(`.
6. `bare-except`  smell, warning: `except:` with no exception type.
Plus a `nested-loops` complexity note (loop inside loop -> "roughly O(n^2)") because the plan's "Done when" requires formatting, naming, smell, complexity AND security findings from the quality sample; complexity category is therefore produced by this rule.
Messages are beginner-friendly, one sentence each ("feedback for learning, not a grade").
TESTS: the quality sample (nested loops, one-letter names, magic number, long line, eval) must yield all five categories; clean code yields none; strings/comments containing `eval` or long numbers do not false-trigger; 5,000-line input analyses in well under 100 ms.
DONE WHEN (plan): the quality sample triggers formatting, naming, smell, complexity and security findings.
LEFT: everything.

### S7 - P-B4 Quality panel (web)  -> DONE (2026-09-30)
DONE (`web/src/quality/index.tsx` + `quality.css`; `markers.ts` and `useRunner.ts`/`index.tsx` in console updated; `server/routes/analyze.ts` extended):
- [x] Watches the editor text by polling `getValue()` every 500 ms (no change event exists). 1.5 s after the text stops changing it calls `POST /api/analyze`. An analysis result is discarded if the text changed meanwhile or a newer request started (no stale markers).
- [x] "Analyze now" button: immediate; sends `{source, log:true, roomCode}` so the server records ONE `lint` learning event (`type:'lint'`, `category` = most frequent finding category or `clean`, `ok` = no findings). Automatic runs never log. Only when identity headers AND roomCode are present (tested).
- [x] UI: status text (Analyzing... / Waiting for you to stop typing... / Checked HH:MM:SS), note "Feedback for learning, not a grade", a summary of four words-only dimensions (Readability, Structure, Naming, Safety: Looks good / Some notes / Needs attention; red only when an error-severity finding is in it; never a number), then groups in order Security, Code smells, Complexity, Naming, Formatting, each with a count and clickable items (severity dot, line, message, rule id). Empty states: "No findings..." and "Nothing to check yet". Errors shown in a notice.
- [x] Markers: findings are published as editor markers through `publishMarkers(editor, 'lint', ...)`; cleared on unmount. Run-error marker and lint markers coexist (tested both ways).
- [x] Click on a finding flashes its line (`flashLine`, 2.5 s) and scrolls to it.
- [x] `data-testid`: `quality-panel, quality-analyze, quality-status (data-phase), quality-summary, quality-group (data-category), quality-item (data-rule, data-line, data-sev), quality-empty, quality-error`.
- [x] Tests: `node scripts/laneb-quality-e2e.mjs` 12/12 (starter = no findings; the plan sample gives all five categories; ordering; summary; squiggles in the editor; click highlights the eval line and the flash goes away; fixing eval removes the finding, the group and the error squiggle; debounce: 0 requests while typing every 350 ms, exactly 1 after the pause; Analyze now sends log+roomCode; lint + run markers coexist and survive each other's refresh; empty editor; run marker still works afterwards). `laneb-analyze.mjs` now 33/33 incl. the lint-event checks.
- BUG found by looking at a screenshot (tests had missed it): after a failed run, replacing the whole file left the ENTIRE editor red, because Lane A's line highlight is a tracked decoration that swells over a replaced document. Also a clicked finding left a permanent red band. Fix: highlights are flashes now; the lasting indicator is the squiggle marker, re-published on text change and dropped when its line changes (`revalidateRunMarker`). Regression tests added to the console suite (whole-file replace; edit below keeps a one-line marker; edit of the failing line removes it). Lesson: a stretched highlight even survived when line 4 was unchanged, so checking the line text alone is not enough.
- Note for Akshit/Rahil (not changed by me): `highlightLine` paints red (`.sv-error-line`) and stretches on replace; anyone else using it should flash it the same way. Rahil's planned Accept (`replaceAll`) is safe with Lane B: markers/flash clear themselves.
LEFT: nothing for S7. Optional polish not done: a duplication dimension in the summary (no duplicate-code rule exists, so it is honestly omitted).
Original plan for reference:
Files: `web/src/quality/index.tsx` (+ siblings).
DO: text changes are detected by polling `editor.getValue()` (no subscription exists); after 1.5 s of no change call `api.post('/api/analyze', {source})`; also an "Analyze now" button. Group findings by category with counts and severity marks; click a finding -> `editor.highlightLine(line)`; publish lint markers through the shared marker module from S5 (info/warning). Cancel or ignore stale responses. States: empty ("No findings" for clean code), loading, error. Note "Feedback for learning, not a grade". Optional if time: the five-dimension maintainability summary from the blueprint (Looks good / Some notes / Needs attention). `data-testid`: `quality-list`, `quality-item`, `quality-analyze`.
DONE WHEN (plan): the quality sample lists findings in all five categories, clicking jumps to the line, markers appear, and fixing a finding removes it within ~2 s.
LEFT: everything.

### S8 - P-B5 More languages  -> DONE (2026-09-30)
DONE (server: `run.ts`; client: `web/src/console/{language.ts,index.tsx,useRunner.ts,console.css}`, `web/src/quality/index.tsx`):
- [x] Probed the real Judge0 first (throwaway scripts, not committed) and designed from the real output, not guesses. Findings: Java fits in the 128 MB limit (uses ~12 MB); `sqrt()` with a variable FAILS to link in C without `-lm` (beginners hit this constantly) and `-Wall -Wextra -lm` fixes it; gcc reports a missing `;` on the NEXT line; every C/C++ crash is the same generic status 11 (NZEC) with a shell line like `run.sh: line 1: 3 Segmentation fault (core dumped) ./a.out`; Java saves the file as `Main.java` so `public class Foo` fails to compile; Node error text starts with `/box/script.js:LINE`.
- [x] Language ids by NAME, newest first (Python prefers 3.12; `JavaFX` excluded; Clang excluded): today C = GCC 14.1 (103), C++ = GCC 14.1 (105), Java = JDK 17 (91), JavaScript = Node 22 (102); fallback ids 71/50/54/62/63 when the list has no match.
- [x] Compiler options: C `-Wall -Wextra -lm`, C++ `-Wall -Wextra`. Warnings are kept in `compileOutput` even when the run succeeds (shown in the Errors tab, tab shows a dot).
- [x] Java: the class that holds `main()` is renamed to `Main` (prefers the `public` top-level class, else the last top-level class before main; identifiers only, never text in strings/comments; nested classes untouched; no change if already Main or if a different `Main` exists). `run.source` keeps the student's original text (line numbers identical); `compileOutput` starts with "Note: your class Foo was renamed to Main so it can run here."
- [x] Error parsing per language (all exported and unit-tested): Node (`script.js:LINE` first occurrence; SyntaxError -> `compile_error`), gcc/g++ (first `error:`; if gcc points at the very first token of a line for an "expected ';' / ',' ... before" error, the line moves back to the previous non-blank statement; linker errors give a message only), javac (`Main.java:LINE: error:`), Java exceptions (first `(Main.java:N)` frame = the student's own line even when the exception is raised inside the JDK; class name shortened, e.g. `ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3`), C/C++ crashes in plain words (segmentation fault, division by zero, abort, uncaught C++ exception with its `what()`), with no line. The `run.sh: line N:` shell wrapper is stripped from stderr.
- [x] `logEvent` category for non-Python runs: Java = exception class name, C/C++ = `SegmentationFault | ArithmeticError | Abort | UncaughtException`, else `compile_error`; Node = error name. NOTE FOR MITI (Lane D): her concept mapping is keyed on Python names (IndexError...), so non-Python categories will show as plain categories without concepts unless she maps them.
- [x] Local fallback runner: Python and JavaScript only. `availableLanguages()` drives both `/api/run-info` and a 400 for the rest ("not available on this server's demo runner"); it never pretends.
- [x] Console UI: a language dropdown next to Run (only shown when more than one language is available), disabled while running, a hint "Running as C. Editor colours stay Python for now." for non-Python, history chips show the language in their tooltip; the choice is kept per tab and falls back to Python if the server cannot run it.
- [x] Quality panel: Python-only. For other languages it shows "Quality checks cover Python only for now..." sends NO requests, removes its markers; switching back to Python resumes analysis (tested).
- [x] Tests: `node scripts/laneb-langs.mjs` 26/26 against the real Judge0 (+ local runner limits): hello/stdin in every language, C `-lm`, C missing `;` -> line 4, warnings kept, segfault/division message without shell noise, C++ compile error + uncaught exception, Java rename + note + stored source untouched, Java compile error line 3, AIOOBE line 4, parseInt line 3, JS ReferenceError line 2, JS SyntaxError -> compile_error line 1, infinite loops -> timeout in C/Java/JS, local runner refuses C/C++/Java. `laneb-parse.mjs` 32/32 (16 new, using outputs captured from the real instance). `laneb-langs-e2e.mjs` 10/10 in a real browser (selector, Java rename, C compile error marked on line 4 in the editor, segfault message without a line button, quality panel steps aside with zero requests, JS error row, reload keeps language, back to Python resumes quality, Python run still works). Full regression all PASS.
- Known limits (be honest if asked): (1) the editor still colours and labels the file as Python/`main.py` (Lane A's Monaco language mode; there is no `setLanguage` on `EditorHandle`) - a request to Akshit would be `EditorHandle.setLanguage(lang)` and a file label; (2) quality checks, AI explanations' concept mapping and the progress-page concepts are Python-centric; (3) one language per person at a time, all people share ONE file; (4) Java `package` lines and multi-file programs are not supported; (5) programs are judged by the public Judge0 instance, no SLA.
LEFT: nothing for S8.
Original plan for reference:
DO: language selector in the console (Python default, C, C++, Java, JavaScript); server maps names to Judge0 ids from `GET /languages` at startup, fallback ids 71/50/54/62/63; `compiler_options: -Wall -Wextra` for C/C++; Java: rewrite `public class X` -> `Main` before submit and tell the user; parsers for gcc (`file:LINE:COL: error: msg`), javac (`Main.java:LINE: error:`), Node (`file:LINE` + stack). Local fallback runner supports Python and JavaScript only (say so in the UI).
DONE WHEN (plan): each language prints hello-world and reads stdin.

### S9 - Integration and hardening  -> TODO
DO: `git fetch`; if other lanes have pushed, merge `origin/<lane>` into `lane-b-simrit` ONLY for testing and only when Simrit agrees (never push their work; push only lane-b). Verify: Lane C reads `lastRun` correctly; Lane D's `canView`/`logEvent`/`getLatestRunFor` work with my routes. Regression: `npm run typecheck`, `npm run build`, `npm run smoke`, `npm run e2e`, `npm run e2e:entry`, plus the Lane B scripts. Edge cases: empty source, huge stdin, unicode, Judge0 down, rate limits, double-click Run, tab hidden while polling, refresh mid-run (run finishes; `runs/latest` returns it), a mentor with an active grant reading a student's run, a third user getting 403.
DONE WHEN: all checks PASS and the smoke-test steps 4 and 5 of the plan (run with different stdin; IndexError marked) pass by hand in two tabs.
LEFT: everything.

### S10 - Demo readiness  -> TODO
DO: run demo beats 3, 4 (run + mark part), 5 by hand; screenshots; graceful "runner unavailable" message; update section 1 and the final report; commit with task IDs; `git push origin lane-b-simrit`.
LEFT: everything.

---------------------------------------------------------------------------------------------------

## 5. Decisions (with reasons)

| # | Decision | Reason |
|---|---|---|
| D1 | Private tracker at `docs/my refrence/LANE-B-TRACKER.md`; do not edit `docs/TRACKER.md` | Simrit's instruction: team tracker belongs to Akshit's branch; hers is local |
| D2 | `docs/my refrence/` excluded via `.git/info/exclude`, not `.gitignore` | `.gitignore` is a shared file (Lane A); exclude is local-only and cannot cause merge conflicts |
| D3 | One `execute()` interface, Judge0 or local subprocess picked by env | Plan risk R1: hosted Judge0 quota/access; keeps S2-S5 unblocked |
| D4 | Fallback runner is labelled "not sandboxed" and never called sandboxed | Plan 7.3, honesty rule |
| D5 | Marker merging through one shared module in Lane B folders | `setMarkers` replaces all markers; both panels need it |
| D6 | No new npm dependencies | Lane A installed everything; adding deps means editing shared package.json |
| D7 | Step order S0-S5 then S6-S7 (S6 may go earlier if Judge0 access stalls) | Never-cut items first; analyzer is independent |
| D8 | Primary runner = public Judge0 `https://ce.judge0.com`; language ids mapped by NAME at startup (prefer newest: Python 3.12.5, GCC 14, JDK 17, Node 22) with the ids in section 6 as fallback | S1 measured: ids differ from the blueprint; works with no key |
| D10 | No silent fallback from Judge0 to the unsandboxed local runner; failure = `service_error` | Honesty rule: never claim sandboxing for the local runner |
| D11 | Per-user limits: 2 s spacing, 30 runs / 10 min, 2 in flight | Blueprint says 20 / 10 min; raised so rehearsals do not trip it |
| D12 | `service_error` runs are not sent to `logEvent` | Not a learning signal; would pollute Lane D's observation rule |
| D9 | Push policy: tracker + `scripts/laneb-*.mjs` + Lane B code may be pushed to `origin/lane-b-simrit` only; never push reference PDFs | Simrit, 2026-09-30 |

## 6. Service facts (measured 2026-09-30 in S1; never write a key here)
- Judge0 endpoint type: public Judge0 CE instance, no API key, no auth headers needed. Base URL: `https://ce.judge0.com` (`JUDGE0_URL` in `.env`).
- Language ids from `GET /languages` (this instance is NEWER than CE 1.13, ids are NOT the blueprint defaults, so map by NAME at startup):
  - Python: 71=3.8.1, 92=3.11.2, **100=3.12.5**, 109=3.13.2, 113=3.14.0
  - C (GCC): 48=7.4.0, 49=8.3.0, 50=9.2.0, **103=14.1.0**
  - C++ (GCC): 52=7.4.0, 53=8.3.0, 54=9.2.0, **105=14.1.0**
  - Java: 62=OpenJDK 13.0.1, **91=JDK 17.0.6**
  - JavaScript (Node): 63=12.14.0, 93=18.15.0, 97=20.17.0, **102=22.08.0**
  - Bold = suggested pick (newest stable). For Python prefer 3.12.5 (id 100): 3.11+ tracebacks contain `~~~~^^^` caret lines that the S3 parser must ignore.
- Quota / rate limit: unknown; the response has NO rate-limit headers. A burst of 12 concurrent submissions all succeeded. Treat 429 / 5xx / network errors as `service_error` with a retry hint.
- Latency (public instance): a trivial Python run takes about 1.7 s wall (Judge0 reports ~1.0 s time, ~52 MB memory as baseline). Infinite loop returns after about 6.3 s (cpu limit 5 s -> status 5). Three concurrent runs ~2-3 s each. So the UI must show "running" for ~2 s; polling every 400-500 ms is fine.
- Status seen: hello/stdin -> 3 Accepted. IndexError, SyntaxError, NameError -> all **11 Runtime Error (NZEC)**, error text only in `stderr` (SyntaxError is NOT compile_error at Judge0 level: our rule must map `SyntaxError`/`IndentationError` in stderr -> `compile_error`). Infinite loop -> 5 Time Limit Exceeded (time=5.079 s).
- Real stderr samples (Python 3.12): IndexError -> `File "/box/script.py", line 4, in average` / `total += nums[i]` / `~~~~^^^` / `IndexError: list index out of range`. SyntaxError -> `File "/box/script.py", line 1` / `def greet(name)` / `^` / `SyntaxError: expected ':'`. NameError -> `File "/box/script.py", line 2, in <module>` ... `NameError: name 'totl' is not defined. Did you mean: 'total'?`. The user's file is `/box/script.py`: match frames on `script.py`.
- Runner in use: Judge0 public instance (primary). Local Python subprocess fallback to be built in S2 (labelled "not sandboxed").

## 7. Test programs (planted bugs, use for S2/S3/S5/S6)
1. IndexError (the room starter): see section 2. Expected error line 4.
2. NameError: `total = 0` ... `print(totl)` -> `NameError: name 'totl' is not defined` at the print line.
3. SyntaxError: `def greet(name)` (missing colon) `    print(name)` -> line 1.
4. Infinite loop: `while True:\n    pass` -> `timeout`, no errorLine.
5. RecursionError: `def f(n):\n    return f(n + 1)\nprint(f(0))` -> `RecursionError`, line 2.
6. Quality sample: nested for-loops, names like `x`, `l`, a magic number such as `86400`, a line over 100 characters, and a call to `eval(user_text)`.
7. Stdin program: `n = int(input())\nprint(n * 2)` with stdin `21` -> `42`.

## 8. Open questions and notes for other people
- Q1 (answered 2026-09-30): Judge0 = `https://ce.judge0.com`, no key. 
- Q2 (answered 2026-09-30): Lane B scripts go in `scripts/laneb-*.mjs` (new files only) and may be pushed, only to `lane-b-simrit`. The tracker may be pushed too (force-add, tracker file only, not the PDFs).
- N1: `EditorHandle` has no change-subscription (we poll) and no reveal-line. Only ask Akshit if `highlightLine` does not scroll.
- N2: `canView` and `logEvent` are Lane D stubs today; re-check when D pushes.

## 9. Risks (from the plan, with the Lane B view)
- R1 Judge0 access/quota (likelihood M, impact H): S1 first; fallback runner behind the same interface.
- R2 setMarkers replace-all collision between run and lint markers: shared marker module (S5/S7).
- R3 No reveal-line: check in S5; ask Lane A only if needed.
- R4 Lane D stubs may change behaviour: re-verify at S9.
- R5 Express 5: async errors in route handlers are forwarded, but background promises are not: catch everything in the run job.
- R6 Secrets: `.env` git-ignored; never print the key.
- R7 Windows CRLF: source arrives LF from Monaco (Lane A fixed it); strip `\r` from Judge0 output.

## 10. Demo checklist for Lane B's beats (plan section 7.1)
- Beat 3: three students run the same file with different stdin; separate consoles. (S4)
- Beat 4 (Lane B part): load the off-by-one sample, run, the error line is marked. (S3, S5)
- Beat 5: quality panel shows findings; fixing one makes it disappear. (S6, S7)
- If asked: "Judge0 is a hosted sandbox; only Python unless P-B5 is done; the quality rules are simple heuristics; no login, privacy is enforced in the API; runs locally." If the local fallback runner is in use: say plainly it is not sandboxed.

---------------------------------------------------------------------------------------------------

## 11. Log (newest last)


- 2026-09-30 S0 started. Read the 4 PDFs (PS 02, overnight plan, blueprint sections for lane B, hackathon deck), the project rules file, team tracker, LANE-B.md and every stub. Wrote the 11-step plan (S0-S10) and got it approved by Simrit (with: private tracker, only do S0 now).
- 2026-09-30 S0: fetched; all three heads equal `2da8f44`; created local branch `lane-b-simrit` tracking origin; set `core.autocrlf input`; added `docs/my refrence/` to `.git/info/exclude` (status clean); created `.env` from example (git-ignored); `npm install` OK (0 vulnerabilities); typecheck clean; dev servers up; health OK (direct + proxy); `/api/run` 501 and `/api/analyze` 501 as expected; smoke 8/8 PASS. Created this tracker. No product code, no commits.
- 2026-09-30 S0 note: `npm install` rewrote the shared `package-lock.json` (npm-version churn: `peer`/`libc` fields). Reverted with `git checkout -- package-lock.json` so the branch stays identical to Akshit's. RULE: after any `npm install`, run `git status`; if `package-lock.json` shows modified, revert it (never commit it; it is Lane A's shared file).
- 2026-09-30 S0 DONE. Stopped as instructed; waiting for go-ahead and Judge0 decision for S1.
- 2026-09-30 Simrit answered: Judge0 URL set in `.env` (`https://ce.judge0.com`, no key); tracker and scripts may be pushed to her branch. S1 started.
- 2026-09-30 S1: scratch script run against Judge0. All six programs behaved (results in section 6). Concurrency: 3 parallel + burst of 12, all Accepted. Ids differ from the blueprint (newer instance), so name-mapping is mandatory. S1 DONE. Nothing committed; no repo files changed except this tracker. Waiting for go-ahead on S2.
- 2026-09-30 S2: wrote run.ts; typecheck clean; laneb-run.mjs 16/16 Judge0. Local run found a bug: a program printing > 128 KB was killed (runtime_error) while Judge0 truncates; fixed to drain and drop output past the cap. Added a local-runner secrets check. 16/16 local. Committed and pushed to `origin/lane-b-simrit` (code, scripts, tracker).
- 2026-09-30 S3: added exceptionLine/parsePythonError/annotateError to run.ts. Unit tests 16/16 first time; laneb-run extended with real error-line assertions: 18/18 on Judge0 and local. Typecheck clean. Committed and pushed as P-B3(server)... see git log.
- 2026-09-30 S4: built console panel (index.tsx, useRunner.ts, console.css). Typecheck clean first time. First e2e run failed only in the 390 px session (shell gives the console 0 width; Lane A's layout, not a bug in the panel); replaced with an 820 px check. Made the double-press test rigorous (assert no 429 notice). Final: 12/12 console e2e, regression suites green. Committed and pushed.
- 2026-09-30 S5: wrote markers.ts and wired it. Three bugs found by the browser test and screenshots, all fixed: marker missing after reload (editor text not synced yet); error row below the fold and output pane growing past the console (layout); noisy Judge0 'Exited with error status 1' line. Two test-only mistakes fixed (Monaco puts the highlight `top` on the parent; focus stayed in the console). Final 16/16 console e2e, all regressions green. Committed and pushed.
- 2026-09-30 S6: wrote analyze.ts (scanner + 8 rules). 3 test failures on the first run were all wrong test expectations (variables named s/t are themselves one-letter names; wrong line number; sort order); analyzer logic was right. Reviewing output on realistic programs led to exempting small whole numbers from magic-number. Final 31/31; typecheck clean; smoke 8/8; laneb-run 18/18. Committed and pushed.
- 2026-09-30 S7: built the quality panel and the optional lint-event logging. 12/12 browser tests first time, but a screenshot showed the whole editor red after a failed run followed by a whole-file replace (tracked-decoration stretch). Fixed by flashing highlights + re-publishing/revalidating markers; found a second flaw while testing the fix (a stretched highlight survives when the line text is unchanged). New regression tests. Test-script editing lesson: CRLF files and Python escapes broke three patch attempts; use the Edit tool or chr(92). Final: all suites PASS (typecheck, build, smoke 8, e2e 13, entry 11, run 18+18, parse 16, analyze 33, console 18, quality 12). Committed and pushed.
- 2026-09-30 S8: probed the real Judge0 for all languages BEFORE coding (my first probe script had a string-escaping slip that produced invalid C; redone with the Write tool). Findings drove the design (-lm, gcc next-line semicolon, Java rename, crash wrappers). Wrote parsers + runner changes; 8 parser tests failed only because the test helper compared with !== (values were equal); fixed the helper. laneb-langs 26/26 and browser 10/10 on the first run. Found and fixed before shipping: Java rename would have renamed a nested class (`static class Node`) - now prefers the public top-level class. Full regression all PASS. Committed and pushed.
- 2026-10-01 S9: found `main` already contains Lane B, C and D. Fast-forwarded lane-b-simrit to origin/main locally (no push). Diagnosed Rahil's AI 503s with direct calls to Google (key OK; 3.8-flash overloaded; 3.1-pro-preview no free quota; her JSON request shape is valid); fixed by setting both model names to gemini-3.1-flash-lite in the local .env. Live explain/patch verified. Ran Rahil's checks, golden path, smoke and all Lane B suites on the merged code: all PASS. Throwaway probe scripts were deleted; no secret was printed or stored.
