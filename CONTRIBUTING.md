# SyncVerse - read this first (every teammate)

SyncVerse is a collaborative real-time code editor for remote STEM education (problem statement PS 02).
Tonight's goal: a working **prototype demo at 9 am**. The plan is `SyncVerse_Overnight_Prototype_Plan.pdf`
(scope, clock, contracts, demo script). The long-term design is `SyncVerse_Master_Blueprint.pdf`.

## Start every session like this

1. Read `docs/TRACKER.md` (the "RESUME HERE" block, then the status table).
2. Read your lane file in `docs/lanes/` (your tasks, what to build, "done when" tests).
3. Work on the next TODO task of your lane whose dependencies are done. Set it DOING in the tracker.
4. When you finish or stop, **update `docs/TRACKER.md`** (status, notes, and the RESUME HERE block). This is how work survives a
   session limit: anyone must be able to continue from the tracker alone.

## Lanes and owners

| Lane | Owner | Folders you may edit |
|---|---|---|
| A | Akshit | `web/src/editor/`, `web/src/video/`, `server/collab.ts`, `server/routes/livekit.ts`; plus shell files only via P-A1: `web/src/App.tsx`, `web/src/session.tsx`, `web/src/api.ts`, `server/index.ts`, `server/identity.ts`, `shared/types.ts` |
| B | Simrit | `web/src/console/`, `web/src/quality/`, `server/routes/run.ts`, `server/routes/analyze.ts` |
| C | Rahil | `web/src/ai/`, `server/routes/ai.ts` |
| D | Miti | `web/src/debug/`, `web/src/progress/`, `web/src/demo/`, `server/routes/debug.ts`, `server/routes/events.ts`, `docs/` samples |

**Only edit your own folders.** App.tsx and server/index.ts already import/mount every lane's folder, so you never need to touch them.
If you need a change in someone else's area, ask in the group chat (or add a note in the tracker).

## Contracts (do not break)

- Types: `shared/types.ts`, imported as `@syncverse/shared`. Additive changes only; announce any change first.
- Web hooks from `web/src/session.tsx`: `useSession()`, `useSessionUser()`, `useWorkspace()` (`lastRun`/`setLastRun`),
  `useEditor()` (`getValue`, `replaceAll`, `setMarkers`, `highlightLine`), `usePresence()`.
- Web HTTP: always use `api.get/post` from `web/src/api.ts` (adds identity headers).
- Server functions other lanes call (keep the signatures): `logEvent(e)` in `routes/events.ts`, `canView(viewerId, ownerId)` in
  `routes/debug.ts`, `getRun(id)` and `getLatestRunFor(ownerId)` in `routes/run.ts`.
- Private by default: a run, explanation or trace is readable only by its owner or an active grantee (`canView`).
- Identity: a signed-in account (token) or a guest (headers, unproven). `web/src/api.ts` sends the right one plus `x-room`, and the server then applies the role the room recorded (mentor / student / viewer), not the claimed one. `req.user.role` may be `viewer` (read-only: do not let viewers run code). Never read the role from anywhere but `req.user`.
- The editor holds several files. `useEditor()` always means the OPEN file; `useActiveFile()` gives `{ id, name, language }` (send `language` with a run request; Judge0 ids are in `shared/files.ts`). `useRoom()` gives the room, my role and `canEdit`.

## Run it

```
npm install
copy .env.example .env      (then fill in your keys; .env is git-ignored, never commit it)
npm run dev                 web http://localhost:5173, server http://localhost:4000 (health: /api/health)
```

Two people on one laptop: open two **tabs** (each tab is a different user). Shortcut to skip the form:
`http://localhost:5173/?name=Asha&role=mentor&room=loops-101`.

## Look and feel (use it in your panels)

Warm paper, ink-black, hairline frames, diagonal hatch bands. Tokens are CSS variables in `web/src/index.css`; do not hard-code colours.

- Colours: `var(--paper)` page, `var(--panel)` panel, `var(--ink)` text and borders, `var(--muted)` secondary text, `var(--rule-soft)` light borders, `var(--danger)` / `var(--ok)` / `var(--warn)`. **Red is only for errors.** People colours (cursors, avatars) come from `usePresence()`.
- **Dark theme:** there is a light and a dark theme (toggle in the top bar, remembered per browser, first visit follows the OS). `<html data-theme="light|dark">` swaps the same CSS variables, so **if you only use variables your panel is themed for free**. Never hard-code a colour (`#fff`, `white`, `rgba(0,0,0,..)`); use `var(--on-ink)` for text on a black button, `var(--overlay)` for modal scrims, `var(--hatch-soft|mid|strong)` for hatch bands, `var(--err-bg)` / `var(--danger-bg)` for error fills. Check your panel in both themes; `npm run e2e:a11y` audits every tab in both.
- Fonts: Geist (text) and Geist Mono (code, numbers, eyebrows), bundled locally so the app works offline.
- Classes: `btn` (black), `btn btn-outline`, `btn-sm`, `btn-block`; `input` (`input code` for monospace), `field`, `seg` (segmented control), `eyebrow` (small mono caps label), `mono`, `panel` / `panel-head`. Icons: `<Icon name="sparkle" />` from `web/src/shell/icons.tsx`.
- Your panel renders inside a tab or a panel that already has padding and a border. Don't add another outer card; use `PanelStub` only while the real panel is unbuilt.
- Gotcha: our CSS in `index.css` is unlayered and beats Tailwind utilities, so a Tailwind class like `hidden` will NOT override `.btn`'s display or an inline `style={{display}}`. Use the `hide-sm` / `hide-md` helper classes, or conditional rendering.
- Keep `data-testid` hooks the tests rely on (see `scripts/e2e-*.mjs`). Add your own for new features.

## Shared helpers and checks (use them, do not rebuild them)

- **Fixtures and demo data:** `import { SAMPLES, SAMPLE_BY_ID, fixtureRuns, fixtureExplanations, fixtureDiagnostics, fixtureGrants, fixturePresence, makeSeedEvents, CONCEPTS, errorCategory, conceptsForCategory, OBSERVATION_RULE } from '@syncverse/shared'`. Build your UI against these before anyone's backend exists. The 9 planted-bug programs have verified error types and lines, and pre-baked explanations (usable as Lane C's answer cache).
- **Toasts:** `const toast = useToast(); toast('Patch applied', 'ok')` (from `web/src/shell/toast.tsx`).
- **Crash shield:** every panel is wrapped in `PanelBoundary`; if yours throws, only your panel shows an error card. Dev trick: open the app with `?crash=ai` to see it.
- **Test hooks:** put the exact `data-testid` names from `docs/TESTIDS.md` on your UI. `npm run e2e:golden` finds your panel through them and reports `SKIP` until your panel root exists, then runs your demo step for real.
- **Checks to run before you merge:** `npm run typecheck`, `npm run smoke`, `npm run e2e:golden`, `npm run e2e:a11y`. Demo morning: `npm run preflight -- --strict` and `npm run e2e:golden -- --strict`.
- **Status chip** (top bar) shows which keys are missing on the server. **Demo script and checklist:** `docs/DEMO.md`.
## Conventions

- TypeScript strict. `npm run typecheck` must pass before you merge.
- React StrictMode is OFF on purpose (it double-opens Monaco/WebSocket/LiveKit connections in dev).
- Server is CommonJS via `tsx`; web is ESM via Vite. Keep server state in memory (resets on restart) unless your task says otherwise.
- Do NOT use `@y/websocket-server` (it needs Yjs 14 pre-release). The Yjs server is our own `server/collab.ts` on stable `yjs` 13.
- Keep comments short and useful. Match the style of surrounding code.

## Git

- Repo: https://github.com/akshitsharma24-ux/SyncVerse. **`main` is the default and integration branch**; it holds the skeleton, Lane A, the shared tooling and Lane D. Lane branches: `lane-a-akshit`, `lane-b-simrit`, `lane-c-rahil`, `lane-d-miti`.
- `git config core.autocrlf input` once per machine.
- Work on **your own lane branch**. Start it from current `main`; merge `origin/main` into it often (`git fetch origin` then `git merge origin/main`). Commit messages start with the task ID.
- When a task is done and `npm run typecheck`, `npm run smoke` and `npm run e2e:golden` pass, merge your branch into `main` (pull request or direct merge). Never push broken code to `main`: it is the demo.
- Never force-push `main`, never commit `.env`.
- **Only the people who did the work are credited (owner's rule).** Do NOT add `Co-Authored-By:` lines, "Generated with ..." lines or any similar tool credit to commit messages, pull requests, issues, code comments or docs. Commit as yourself only. If you find an existing commit with such a line, tell the repo owner instead of rewriting shared history.

## Never cut (the demo)

Editor + presence (A2, A3), run + error line (B1 to B3), AI explain (C1, C2), debug access (D1). See the cut ladder in the plan.




