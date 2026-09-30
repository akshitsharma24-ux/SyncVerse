# SyncVerse - read this first (every teammate and every Claude session)

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
- Identity is a trusted header (no login). Prototype only.

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
- Fonts: Geist (text) and Geist Mono (code, numbers, eyebrows), bundled locally so the app works offline.
- Classes: `btn` (black), `btn btn-outline`, `btn-sm`, `btn-block`; `input` (`input code` for monospace), `field`, `seg` (segmented control), `eyebrow` (small mono caps label), `mono`, `panel` / `panel-head`. Icons: `<Icon name="sparkle" />` from `web/src/shell/icons.tsx`.
- Your panel renders inside a tab or a panel that already has padding and a border. Don't add another outer card; use `PanelStub` only while the real panel is unbuilt.
- Gotcha: our CSS in `index.css` is unlayered and beats Tailwind utilities, so a Tailwind class like `hidden` will NOT override `.btn`'s display or an inline `style={{display}}`. Use the `hide-sm` / `hide-md` helper classes, or conditional rendering.
- Keep `data-testid` hooks the tests rely on (see `scripts/e2e-*.mjs`). Add your own for new features.

## Conventions

- TypeScript strict. `npm run typecheck` must pass before you merge.
- React StrictMode is OFF on purpose (it double-opens Monaco/WebSocket/LiveKit connections in dev).
- Server is CommonJS via `tsx`; web is ESM via Vite. Keep server state in memory (resets on restart) unless your task says otherwise.
- Do NOT use `@y/websocket-server` (it needs Yjs 14 pre-release). The Yjs server is our own `server/collab.ts` on stable `yjs` 13.
- Keep comments short and useful. Match the style of surrounding code.

## Git

- Repo: https://github.com/akshitsharma24-ux/SyncVerse. Branches: `lane-a-akshit`, `lane-b-simrit`, `lane-c-rahil`, `lane-d-miti` (all start from the same skeleton commit).
- `git config core.autocrlf input` once per machine.
- Work and push only on **your own lane branch**. Commit messages start with the task ID. Pull another lane's work with `git fetch origin` and `git merge origin/<their-branch>`.
- `main` is created at the first integration window and lanes merge into it one at a time; run `npm run smoke` and the e2e checks after each merge.
- Never force-push, never commit `.env`.
## Never cut (the demo)

Editor + presence (A2, A3), run + error line (B1 to B3), AI explain (C1, C2), debug access (D1). See the cut ladder in the plan.



