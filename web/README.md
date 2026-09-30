# SyncVerse — Quiet Studio

A separate dark frontend exploration. The original `web/` app remains the default in every root npm script.

## Preview

- New design: **http://localhost:5174**
- Original frontend: **http://localhost:5173**
- Existing API: **http://localhost:4000**

Start the original app and API from the repository root with `npm run dev`. Start this alternative in another terminal:

```powershell
npm --prefix frontend2 run dev
```

The existing root `node_modules` supplies dependencies. No root manifest or lockfile changes are needed. Port 5174 is strict. If it is already running, open the preview link directly.

## Design and behavior

Charcoal surfaces, warm white typography, muted olive accents, locally bundled Geist fonts, and a serif contrast in the headline. Motion includes entry transitions, cursors, an orbital code illustration, hover feedback, and scroll reveals. Reduced-motion preferences are respected.

The landing preview has three fixed Python examples with illustrative output. Create room and Join room are centered primary actions. Enter a room for the real Monaco editor, Yjs synchronization, file controls, private console, AI panel, quality analysis, debug permissions, progress, and video tools.

The editor starts directly below the room bar. The navigation sidebar starts collapsed; the sidebar, console, and learning panel each open and close independently. Drag their dividers or use arrow keys to resize. Panel sizes and visibility are remembered. Focus mode sits beside Samples and temporarily hides the panels, restoring them when exited. On phones, the console and learning panel resize vertically. The exit button explicitly says “Leave room.” Call controls wrap within the learning panel and chat stacks below the video.

Service availability depends on the existing backend configuration. Browser storage is isolated by port; rooms intentionally use the existing API. Create a new room for experimenting.

## Independence

All changes are inside `frontend2/`. Original tracked files match the starting snapshot, including pre-existing user changes. Root scripts and lockfile are unchanged. No branch changes, staging, commits, merges, or pushes were made.

## Validation

```powershell
npm --prefix frontend2 run build
node frontend2/verification/check-preview.mjs
node frontend2/verification/check-call-layout.mjs
```

The browser check needs the API, both frontends, and Microsoft Edge. It creates fresh rooms and checks examples, keyboard dialogs, real room creation, invitations, two-session synchronization, five tool panels, focus mode, resizing, history, mobile/tablet layouts, accessibility, and browser errors. It does not call Gemini or initiate a video session. Results and screenshots are in `verification/`.

The call-layout check uses a labelled markup fixture to verify control and chat geometry at 260–650px panel widths. It does not establish live media connectivity.

The production build separates the landing page from the heavier editor workspace. Monaco and video dependencies still produce a large workspace chunk.
