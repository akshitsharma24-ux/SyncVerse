# SyncVerse - build tracker and handoff sheet

> **If you are a new person or a new Claude session: read this block first, then `CLAUDE.md`, then your lane file in `docs/lanes/`.**
> The plan PDFs are in the repo root (`SyncVerse_Overnight_Prototype_Plan.pdf` = tonight's plan, `SyncVerse_Master_Blueprint.pdf` = long-term target).

## RESUME HERE (updated after every step)

- **Latest Lane C key update:** Replacement Gemini key configured in ignored local `.env`; dev servers restarted. The user requested integration only and will perform testing. No live generation calls or test suites were run for this replacement; provider failures below belong to the previous key. Part 4 remains pending user approval.

- **P-A6 Frontend design: DONE** (Lane A extra, verified). The whole app now follows the team's reference look (warm paper, ink, hairline frames, diagonal hatch bands): entry page with centred two-tone headline, Create/Join card (auto room code, role, invite prefill), a live animated mock editor that loops the product story, six feature cells; workspace with top bar (room chip + copy invite link, presence avatars), themed Monaco, resizable console/dock (drag or arrow keys), icon tabs. Responsive down to 390 px. Fonts (Geist, Geist Mono) are bundled, so it works offline. Files: `web/src/JoinGate.tsx`, `web/src/landing/`, `web/src/shell/`, `web/src/App.tsx`, `web/src/index.css`, `web/src/editor/monaco-setup.ts`. The lane slots in App.tsx, every hook in `session.tsx` and all test hooks are unchanged; other lanes only got restyled stub buttons. Teammates: read the **Look and feel** section of `CLAUDE.md` before building your panel.
- **Entry-page copy describes all six features** (incl. AI explain, debug by invitation, progress, video). They must exist by the demo or the page over-promises; adjust `web/src/landing/Features.tsx` if a lane is cut.
- **Status in one line:** Lane A (Akshit) MUST tasks P-A1 to P-A4, SHOULD task P-A5 and the extra P-A6 (frontend design) are built and tested. Everything is pushed to https://github.com/akshitsharma24-ux/SyncVerse on branch `lane-a-akshit`; the other lane branches (`lane-b-simrit`, `lane-c-rahil`, `lane-d-miti`) start from the same commit so Simrit, Rahil and Miti can begin.
- **Lane C current (2026-09-30, after account handoff):** P-C1/P-C2 remain implemented; P-C3's sample patch workflow is complete and verified on `lane-c-rahil`, awaiting user review. Demo: `http://localhost:5173/?name=Rahil&role=student&room=lane-c-review` (requires running dev servers). In AI, load the labelled sample, then Suggest a patch, Reject, or Accept; Accept syncs to a second browser. Fixed the optional-source API contract, stale-preview detection, and Monaco cleanup. Checks: 12 API fixture checks and 7 two-browser checks pass with no browser runtime errors. Actual Gemini: model-list auth HTTP 200, explanation generation HTTP 503, patch generation quota unavailable. Live generation and Lane B integration remain pending. Read `PlanLaneC.md`; stop for user review before Part 4. Existing work is uncommitted; no branch switch, merge, commit, or push was performed.
- **RESOLVED (was blocker 1):** repo pushed. Everyone: `git clone https://github.com/akshitsharma24-ux/SyncVerse.git`, `git checkout <your lane branch>`, `npm install`, `copy .env.example .env`, `npm run dev`, then start your lane file in `docs/lanes/`. Branch rules are in README and CLAUDE.md.
- **BLOCKER 2 (Miti, P-D0):** LiveKit Cloud project keys (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) into `.env`. Until then the video dock shows its setup hint and the real call is **unverified**.
- **Who is working / next for Lane A:** nothing left in Lane A's MUST list. Useful next: (1) once keys exist, test a real 2-person call by hand on two devices and then mark P-A4 verified; (2) help Lane B (Simrit has the least slack): take P-B4 lint rules or P-B5 if asked; (3) after the first integration, fix contract mismatches reported against Lane A.
- **How to verify everything (dev servers must be running via `npm run dev`):** `npm run typecheck`; `npm run smoke` (8 checks: health, 404, Yjs sync/merge/replaceAll/awareness/room persistence); `npm run e2e` (13 checks, two real Edge sessions: sync, simultaneous typing, presence, typing indicator, cursor label, usePresence, leave detection, refresh persistence, markers); `npm run e2e:video` (2 checks without keys); `npm run e2e:entry` (11 checks: entry page, create/join, invite link, validation, phone/tablet overflow, animated mock, tabs, keyboard resize); `npm run test:persist` (starts its own server on :4101: code survives a hard restart); `npm run e2e:reconnect` (starts its own API :4300 + web :5300, kills the API mid-session: offline pill, offline typing, reconnect, both sides converge, no duplicates); `npm run build`. Last full run: all PASS. If an e2e run stalls at browser launch, just rerun it (seen once, three clean reruns).
- **Dev servers:** `npm run dev` may be running in the background on this machine (web :5173, API :4000). Servers started from a Claude session are stopped when that session's background limit is hit (the web app was stopped once and restarted as `npm run dev -w web`; the API runs separately as `npm run dev -w server`). Check `http://localhost:5173` and `http://localhost:4000/api/health`; if down, run `npm run dev`. If ports are busy, stop the old process first. Do not kill all node processes: the API server's real process is a child of `tsx watch`.
- **Environment facts:** Node v24, npm 11 (prints an "allow-scripts" warning for esbuild; harmless), Windows 11, Microsoft Edge used for browser tests (playwright-core, channel msedge). The Bash tool's safety check was flaky; PowerShell worked reliably.
- **Bugs found by testing and fixed (keep the fixes):** (1) Windows Monaco models default to **CRLF** while Yjs text uses LF, so offsets drifted one char per line (leftover text after `replaceAll`, diverging concurrent edits). Fix: `model.setEOL(LF)` before binding in `web/src/editor/index.tsx`. (2) `concurrently` was missing from the root manifest. (3) Arrow/navigation keys wrongly counted as "typing"; only edit keys count now.
- **Decisions and facts:** `y-websocket` v3 no longer contains the server; the separate `@y/websocket-server` 0.1.5 needs Yjs 14 pre-release (clashes with the browser's Yjs 13), so `server/collab.ts` is our own Yjs sync + awareness server on stable yjs 13. Rooms persist to `server/data/rooms/<code>.ydoc` (git-ignored, debounced 800 ms, atomic). React StrictMode is off on purpose. Session is per browser TAB (sessionStorage). Identity is a trusted header (prototype). Dev-only hook `window.__sv.editor` exposes the EditorHandle for tests.
- **Stubs other lanes replace (contracts already in place):** `server/routes/run.ts` (B), `analyze.ts` (B), `ai.ts` (C), `debug.ts` (D), `events.ts` (D); web folders `console/`, `quality/` (B), `ai/` (C), `debug/`, `progress/`, `demo/` (D). Each already answers 501 or shows a labelled placeholder.
## P-A1 checklist (Lane A, Akshit)

- [x] Root `package.json` with npm workspaces (shared, server, web)
- [x] `.gitignore`, `.gitattributes`, `.env.example`
- [x] `shared/types.ts` contracts (all lanes import from `@syncverse/shared`)
- [x] `server/package.json`, `web/package.json` with every dependency; `npm install` done (0 vulnerabilities)
- [x] Server: `tsconfig.json`, `index.ts`, `identity.ts`, `stub.ts`, `collab.ts` stub, stub routers (run, analyze, ai, debug, events/progress, livekit), `/api/health` (written, NOT yet run)
- [x] Server stub exports with final signatures: `logEvent`, `canView`, `getRun`, `getLatestRunFor`
- [x] `@y/websocket-server` uninstalled; `concurrently` added to the root (the first `npm run dev` test caught it missing); lockfile synced
- [x] Web: `tsconfig`, `vite.config.ts` (proxy /api and /collab, monaco alias), `index.html`, Tailwind, `main.tsx` (StrictMode off on purpose)
- [x] Web: `session.tsx` (Session, Workspace, Editor, Presence contexts + hooks), `api.ts` (fetch helper with identity headers), `JoinGate.tsx` (`?name=&role=&room=` auto-joins; session is per TAB)
- [x] Web: `App.tsx` shell with one slot per panel; folder stubs: editor (real plain Monaco + EditorHandle), video, console (with wiring-check buttons), quality, ai, debug, progress, demo
- [x] `CLAUDE.md`, `README.md`, `scripts/smoke.mjs`, per-lane files in `docs/lanes/` (generated from the plan's task data)
- [x] Verified: `npm run typecheck` clean, `npm run build` ok, `npm run dev` starts, `/api/health` answers directly and through the Vite proxy, stub route returns 501, unknown route 404, `npm run smoke` PASS, headless-Edge screenshot shows the shell with Monaco + Python highlighting + all lane stubs
- [ ] **Commit and push to GitHub** (needs a human: create the repo, run the commands in README). Then tell Simrit, Rahil, Miti to clone.

## Status of every task

Status values: TODO, DOING, MERGED, BLOCKED. Windows assume a 5:30 pm start (see the plan PDF; shift if you started later).

| ID | Lane | Owner | Task | Tier | Status | Hrs | Window | Notes |
|---|---|---|---|---|---|---|---|---|
| P-A1 | A | Akshit | Skeleton on main | SETUP | DONE (on lane-a-akshit) | 1.0 | 5:30pm-6:30pm | verified; pushed on lane-a-akshit |
| P-B0 | B | Simrit | Judge0 hello-world | SETUP | TODO | 1.0 | 5:30pm-6:30pm |  |
| P-C0 | C | Rahil | LLM hello-world | SETUP | BLOCKED | 1.0 | 5:30pm-6:30pm | Rechecked 2026-09-30: model-list auth HTTP 200; real explanation HTTP 503; strong-model patch quota unavailable |
| P-D0 | D | Miti | LiveKit keys and samples | SETUP | TODO | 1.0 | 5:30pm-6:30pm |  |
| P-A2 | A | Akshit | Synced editor and rooms | MUST | DONE (on lane-a-akshit) | 2.0 | 6:30pm-8:30pm |  |
| P-A3 | A | Akshit | Cursors and presence | MUST | DONE (on lane-a-akshit) | 1.0 | 8:30pm-9:30pm |  |
| P-A4 | A | Akshit | Video dock | MUST | DONE, live call UNVERIFIED (needs keys) | 1.5 | 9:30pm-10:30pm, 11:30pm-12am |  |
| P-A5 | A | Akshit | Persist documents, reconnect banner | SHOULD | DONE, verified (on lane-a-akshit) | 0.5 | 12am-12:30am |  |
| P-A6 | A | Akshit | Frontend design: entry page + themed workspace | EXTRA | DONE, verified (on lane-a-akshit) | - | - | added on request; see Look and feel in CLAUDE.md |
| P-B1 | B | Simrit | Run pipeline | MUST | TODO | 2.0 | 6:30pm-8:30pm |  |
| P-B2 | B | Simrit | Console panel | MUST | TODO | 1.5 | 8:30pm-10pm |  |
| P-B3 | B | Simrit | Error line marking | MUST | TODO | 0.5 | 10pm-10:30pm |  |
| P-B4 | B | Simrit | Quality analysis (Python, six rules) | MUST | TODO | 1.0 | 11:30pm-12:30am |  |
| P-B5 | B | Simrit | More languages | SHOULD | TODO | 1.0 | 12:30am-1:30am |  |
| P-C1 | C | Rahil | LLM gateway and explain | MUST | DOING | 2.0 | 6:30pm-8:30pm | Gateway implemented; live explanation still HTTP 503 after account handoff; no fabricated success |
| P-C2 | C | Rahil | AI panel | MUST | DONE (synthetic demo; Lane B integration pending) | 1.0 | 8:30pm-9:30pm | AI tab loads an explicitly labeled sample into the shared editor and calls the explain route; ordinary runs await Lane B records |
| P-C3 | C | Rahil | Patch preview, Accept or Reject | MUST | DONE (sample workflow; live integration pending) | 1.5 | 9:30pm-10:30pm, 11:30pm-12am | 12 API fixture + 7 browser checks pass; Reject unchanged, Accept syncs, stale edits blocked; user review next; Gemini quota/Lane B integration pending |
| P-C4 | C | Rahil | Hint mode | SHOULD | TODO | 1.0 | 12am-1am |  |
| P-C5 | C | Rahil | AI answer check | SHOULD | TODO | 0.5 | 1am-1:30am |  |
| P-D1 | D | Miti | Permission-gated debug access | MUST | TODO | 2.5 | 6:30pm-9pm |  |
| P-D2 | D | Miti | Learning events and progress | MUST | TODO | 1.5 | 9pm-10:30pm |  |
| P-D3 | D | Miti | Samples and seed data | MUST | TODO | 0.5 | 11:30pm-12am |  |
| P-D4 | D | Miti | Mentor overview tiles | SHOULD | TODO | 1.5 | 12am-1:30am |  |

## Log (newest last)


- P-C3 started on `lane-c-rahil`: implementing a validated Gemini patch draft, Monaco diff preview, explicit accept/reject decisions, and stale-editor regeneration.
- P-C0/P-C1/P-C2 update: added the user-provided key to ignored local `.env`; health reports the LLM setting present. Corrected the Gemini `generateContent` JSON schema fields against Google's API docs. Typecheck passes, but repeated live calls return Google HTTP 503, so live generation remains unverified. Added a clearly labeled, non-executed TypeError sample to exercise the AI tab before Lane B run records exist; README records the setup and limitation.

- P-C0/P-C1 started on `lane-c-rahil`: Gemini structured-output gateway, server-side key configuration, sample responses, request limits/cache, and README setup. Gateway implementation is in place; live Gemini verification is waiting for the key.
- P-C2 panel implementation started: the AI tab reads `lastRun`, calls `/api/ai/explain`, highlights the parser line, and renders result/loading/error states. Lane B's run record dependency remains a stub in this branch.
- Plan PDFs written (blueprint 33 pages, overnight plan 12 pages).
- P-A1: root config, shared contracts, manifests, `npm install` done. Continuing with server and web stubs.
- P-A1 finished and verified (typecheck, build, dev servers, health via proxy, smoke, screenshot). Bugs found and fixed on the way: `concurrently` missing from root manifest; `@y/websocket-server` needs Yjs 14 (removed, own server instead). Bash safety check was flaky; PowerShell worked for npm and git.
- P-A2 started: writing `server/collab.ts`.
- P-A2 finished: Yjs server tested with real y-websocket clients; editor bound; two-browser e2e found the CRLF/LF offset bug, fixed. Added `scripts/e2e-editor.mjs` (`npm run e2e`) and `playwright-core` dev dependency. P-A3 started.
- P-A3 finished: labelled remote cursors, presence strip, usePresence feed; tested with real browsers (13 PASS); screenshot checked with three users. Typing indicator restricted to edit keys. P-A4 started.
- P-A4 finished: LiveKit token route (JWT verified with dummy keys: room sv-<code>, identity, publish/subscribe, 2 h), video dock with Join button and setup-hint error path; `npm run e2e:video` 2 PASS. Live media unverified (no keys). Mistake: my cleanup killed the API server's child process; restarted it.
- P-A5 finished: rooms saved to disk and reloaded; `npm run test:persist` 2 PASS (hard restart keeps code, starter not duplicated). Connection status pill already shows offline/connecting/live.
- Full regression pass: typecheck clean, build ok, smoke 8 PASS, e2e 13 PASS x3, e2e:video 2 PASS, test:persist 2 PASS.
- Lane A double-check: clean copy of the repo (no node_modules/.git) installs in 16 s, typechecks clean, builds, and its server passes all 8 smoke checks on a spare port. Added `npm run e2e:reconnect` (5 PASS): status pill goes offline/connecting when the API dies, offline typing works, both tabs return to live, the offline edit reaches the other person, texts identical with no duplicated lines. `web/vite.config.ts` now honours `SYNCVERSE_SERVER` to target another API port.
- STILL UNVERIFIED for Lane A: (1) a real 2-person LiveKit call (needs keys + two devices; screen share and chat come from LiveKit's prebuilt component and are untested); (2) access from a second device on the LAN / phone hotspot (Vite `host: true` is set but never tried); (3) the pushed-to-GitHub fresh-clone flow (git has zero commits); (4) integration with the real Lane B/C/D code.
- P-A6 finished: entry page + themed workspace built to the user's reference images (white/paper theme kept; the purple second image was used for layout only: create/join forms beside feature cards). Tests: `npm run e2e:entry` 11 PASS; full regression 41 checks PASS (smoke 8, e2e 13, entry 11, video 2, reconnect 5, persist 2), typecheck and build clean. Bugs found by tests/screenshots and fixed: nav overflowed on phones because Tailwind `hidden` classes lose to unlayered CSS / inline display (use `hide-sm` / `hide-md`); cursor name labels blinked with the caret; hero headline wrapped to four lines in a narrow column; red people-colour removed (red = error).

### Account continuation, 2026-09-30

- Resumed Part 3 from the existing uncommitted working tree on `lane-c-rahil` after reading the handoff, both PDFs, and lane instructions. Preserved all earlier work. Implementation changes stayed in `server/routes/ai.ts` and `web/src/ai/`; documentation updated in README, tracker, and PlanLaneC.
- Fixed `/api/ai/patch` compatibility with `{runId}`; optional `source` supports current-editor regeneration, and blank/oversized source is rejected. Added live stale detection while the modal is open; Accept still compares source immediately before applying. Fixed diff cleanup by explicitly owning and cancelling Monaco's view model before disposing its text models.
- Added repeatable checks: `node web/src/ai/check-api.cjs` (12 PASS, mocked Gemini and run fixture) and `node web/src/ai/check-browser.mjs` (7 PASS, real sample API and two Edge contexts; regenerated/pending/error cases use mocks). Browser runtime errors: none in the final run. These checks do not validate real Gemini answer quality.
- Retried actual configured Gemini requests: model list HTTP 200, explanation HTTP 503, patch quota failure (`ai_quota_exceeded`). No credential was printed or moved into tracked files. Real run records still await Lane B; no code in other lanes was changed. Part 4 and Part 5 remain TODO; await user review.
- Final server/web typecheck and production build PASS after the diff lifecycle fix; the existing large-bundle warning remains. Dev servers are running on :5173/:4000. No commit, push, merge, or switch away from `lane-c-rahil`.
