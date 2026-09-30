# web: the SyncVerse frontend (Quiet Studio)

The default frontend. Dark charcoal surfaces, warm white type, a muted olive accent, locally bundled Geist fonts, a serif contrast
in the headline. It replaced the earlier "paper and ink" frontend, which is kept in `../frontend-old/` (see its README).

```
npm run dev          # from the repository root: API on :4000, this frontend on http://localhost:5173
npm run build        # typecheck + production build
npm run typecheck
```

## What is in it

- **Entry page** (`src/JoinGate.tsx`, `src/studio/StudioPreview.tsx`): centred Create room / Join room actions, a working
  preview with three example programs, account sign-in, recent rooms, invite links.
- **Workspace shell** (`src/studio/StudioShell.tsx`, `layout.tsx`, `workspace.css`): the editor sits directly under the room bar;
  the sidebar (starts collapsed), the console and the learning panel each open, close and resize on their own (drag, or arrow keys
  on the divider); sizes and visibility are remembered (`localStorage` key `studio.layout.v2`). Focus mode hides the panels and
  restores them on exit. On phones the console and learning panel stack and resize vertically.
- **Learning tools** (the list at the top of `StudioShell.tsx`): Understand (AI explain and patch), Together (video), Whiteboard,
  Code quality, Debug, Your progress. To add a tool, add one line to that list.
- **Shared whiteboard** (`src/whiteboard/`, contract in `shared/whiteboard.ts`): pen, line, arrow, rectangle, ellipse, text,
  eraser, six colours, three sizes, undo, mentor-only clear, PNG export, and a large view. A dark page with a dot grid; see
  `palette.ts` for the colours and `whiteboard.css` for the look.
- **Editor** (`src/editor/`): Monaco + Yjs. Tab-completable snippets (Java `sout`, `fori`, `main`, ...) and completions are in
  `snippets.ts`; `monaco-setup.ts` loads the suggest and snippet modules and defines the dark theme.

## Rules for panels

The panels still follow the lane contracts in `docs/lanes/` and the test ids in `docs/TESTIDS.md`. Style with the CSS variables
in `src/studio/studio.css` (`--panel`, `--ink`, `--accent`, `--rule-soft`, ...) and they match the shell.

The app is dark only: `theme.ts` keeps the `dark` attribute on `<html>`, and the old toggle is not shown.

## Checks

```
npm run e2e:studio        # landing page, real rooms, every tool, layout and persistence, phones, axe audits
npm run e2e:call-layout   # the video dock's controls and chat at 260 to 650 px (a labelled fixture, no real call)
npm run e2e:a11y          # axe audit of every screen
```

Screenshots and audit results from `e2e:studio` are written to `<temp>/syncverse-studio`.
