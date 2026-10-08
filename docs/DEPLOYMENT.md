# Deploy SyncVerse (free)

`web/` is the only frontend. Production runs one Node service: Express serves
the Vite build, `/api`, and the `/collab` WebSocket on the same HTTPS origin.
`render.yaml` targets Render's **free** web service, so nothing here costs money.

## What the free tier means

- The service sleeps after 15 minutes with no traffic and takes about a minute to wake.
  Open the URL a few minutes before a demo. Active WebSocket traffic keeps it awake.
- There is no persistent disk and the filesystem is wiped on every sleep, restart, or
  redeploy. Rooms, editor contents, and versions reset when that happens. That is why the
  Blueprint runs in guest mode (`REQUIRE_AUTH=0`): accounts could not survive either.
- 750 free instance hours per calendar month, enough for one service running all month.
- Code runs on the free public Judge0 instance (`https://ce.judge0.com`, no key). It is
  shared and rate-limited, so heavy use may be slow or refused.

For real classes (accounts, saved rooms) you need a paid service with a persistent disk;
that is out of scope for the free setup.

## Deploy on Render

1. Commit and push these changes, including **all of `web/`**, the root
   lockfile, `server/start.ts`, and `render.yaml`, to the GitHub branch you want to
   deploy. Never commit `.env`.
2. In Render choose **New > Blueprint**, connect
   `https://github.com/akshitsharma24-ux/SyncVerse`, and select that branch.
3. Render shows the resources from `render.yaml`: one **Free** Node web service. It asks
   for `LLM_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Paste
   your values, or leave a field blank to turn that feature off:

   | Feature | Variables | Blank means |
   | --- | --- | --- |
   | AI tutor | `LLM_API_KEY` | AI explanations use the built-in answers only |
   | Video calls | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (all three) | Video is off |

   Use the free LiveKit Cloud plan and your existing LLM key. Credentials belong only in
   the server environment, never in `VITE_*` variables or the frontend source.
4. Deploy, then open the assigned `https://...onrender.com` URL. Check `/api/health`
   (it reports key presence, not whether the provider calls succeed), then test a room
   in two browsers: shared edits, one code run, and any AI/video feature you enabled.

Join links look like `https://<your-app>.onrender.com/?name=Rahil&role=student&room=demo`.
Render supplies `PORT`; leave it unset. Keep one instance: collaboration and some state
live in memory and are not shared across servers.

The same setup can be entered manually under **New > Web Service**:

| Setting | Value |
| --- | --- |
| Instance type | Free |
| Root directory | Leave blank (repository root) |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health path | `/api/health` |
| `NODE_VERSION` | `24.18.0` |
| `NODE_ENV` | `production` |
| `AUTH_SECRET` | Any random string of at least 16 characters |
| `REQUIRE_AUTH` | `0` |
| `SYNCVERSE_DATA_DIR` | `/tmp/syncverse` |
| `COLLAB_DATA_DIR` | `/tmp/syncverse/rooms` |
| `LOG_TO_FILE` | `0` |
| `JUDGE0_URL` | `https://ce.judge0.com` |

Production startup rejects a missing `JUDGE0_URL` or `RUNNER=local`, because the local
subprocess runner is not sandboxed.

## Local production check

```sh
npm ci --include=dev
npm run typecheck
npm run build
npm run test:production
npm start
```

Stop `npm run dev` before `npm start` if port 4000 is in use. Production opens at
http://localhost:4000 and uses the existing `.env` locally. The production test
uses isolated temporary data and does not call AI, Judge0, or LiveKit providers.

A static-only host cannot run the API or collaboration server, so the UI and backend
are deployed together as one service.

Official references: [Render free tier](https://render.com/docs/free),
[Blueprint specification](https://render.com/docs/blueprint-spec), and
[WebSockets](https://render.com/docs/websocket).
