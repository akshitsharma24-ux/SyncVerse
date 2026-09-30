# Lane A - Editor sync, presence, video  (owner: Akshit)

Read `CLAUDE.md` and `docs/TRACKER.md` first. Update the tracker when you start and finish each task.

**Folders you may edit:** `web/src/editor/`, `web/src/video/`, `server/collab.ts`, `server/routes/livekit.ts` (and the shell files, only in P-A1 or by agreement)

**Start without waiting:** You own the foundation. Everyone else builds against the stubs you pushed in P-A1, so keep the `EditorHandle`, `useEditor`, `usePresence` signatures stable while you replace the internals.

Clock windows assume a 5:30 pm start. MUST tasks are the demo; SHOULD tasks only when the golden path is green on main.

## P-A1 - Skeleton on main  [SETUP, 1.0 h, 5:30 pm-6:30 pm]

npm workspaces (web, server, shared). Vite + React + TypeScript with plain Monaco behind the EditorHandle. Express server with empty routers mounted for run, analyze, ai, debug, events, livekit. Shell layout with one named slot per panel. `shared/types.ts`, session context, WorkspaceContext, `usePresence` stub, stubs of `logEvent` and `canView`. Install **every** dependency in section 3.1 now so nobody edits package.json later. Vite proxy for /api and /collab. `.env.example`, .gitignore, docs/TRACKER.md.

**Done when:** A fresh clone runs `npm install && npm run dev` and shows the shell. B, C and D have pulled it and can run it.

**Blueprint tasks:** T-00-02, T-00-03, T-D-01

## P-A2 - Synced editor and rooms  [MUST, 2.0 h, 6:30 pm-8:30 pm]

`server/collab.ts`: Yjs WebSocket, one document per room code. Web: join screen (name, role student or mentor, room code), Monaco bound to the room's Y.Text with y-monaco, `EditorHandle` implemented on top of it. `replaceAll` is one Y transaction. Single shared file, Python mode.

**Done when:** Two browsers in the same room see each other's typing with no lost characters; `setMarkers` and `highlightLine` work from the console.

**Needs:** P-A1

**Blueprint tasks:** T-A-02, T-A-03, T-A-04 (lite)

## P-A3 - Cursors and presence  [MUST, 1.0 h, 8:30 pm-9:30 pm]

Labelled coloured remote cursors and selections from Yjs awareness (y-monaco needs a little CSS per user). Presence list with online / typing / idle, exposed through `usePresence()` for Lane D.

**Done when:** A collaborator's name label follows their cursor and the list shows three people.

**Needs:** P-A2

**Blueprint tasks:** T-A-05

## P-A4 - Video dock  [MUST, 1.5 h, 9:30 pm-10:30 pm, 11:30 pm-12 am]

`server/routes/livekit.ts` mints a token. Web: LiveKit prebuilt conference component in a collapsible dock. It already includes camera and mic toggles, screen share and in-room chat.

**Done when:** Two devices see and hear each other, screen share works, chat works.

**Needs:** P-D0 keys

**Blueprint tasks:** T-A-07, T-D-12

## P-A5 - Persist documents, reconnect banner  [SHOULD, 0.5 h, 12 am-12:30 am]

Save Yjs state to a JSON file on change (debounced) and reload it at start. Show a banner when the WebSocket drops.

**Done when:** Restarting the server keeps the code; unplugging Wi-Fi shows the banner.

**Needs:** P-A2

**Blueprint tasks:** T-A-03, T-A-12
