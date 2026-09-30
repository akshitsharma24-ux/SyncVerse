# SyncVerse

Collaborative real-time code editor for remote STEM education (PS 02). Overnight prototype.

- Plan for tonight: `SyncVerse_Overnight_Prototype_Plan.pdf`
- Long-term design: `SyncVerse_Master_Blueprint.pdf`
- Live status and handoff: `docs/TRACKER.md`
- Lane C five-part plan and account handoff: `PlanLaneC.md`
- Conventions for people and Claude sessions: `CLAUDE.md`

## Quick start

Needs Node 20 or newer (tested on Node 24).

```
npm install
copy .env.example .env     # fill in keys as your lane needs them
npm run dev
```

- Web: http://localhost:5173  (proxies /api and /collab to the server)
- Server: http://localhost:4000, health at http://localhost:4000/api/health (shows which keys are configured)
- Two users on one machine: use two browser **tabs**. Skip the form with `/?name=Asha&role=mentor&room=loops-101`.
- Other devices on the same network or phone hotspot: open `http://<your-laptop-ip>:5173`.

### Lane C Gemini gateway (Part 1)

**Latest key update:** A replacement Gemini key has been saved to ignored local `.env`, and the dev server restarted. The user will test this key; no generation calls or test suites were run for the replacement. The provider failures documented below describe the earlier key.

After copying `.env.example` to `.env`, put your Google Gemini API key in `LLM_API_KEY`. Preserve an existing `.env` when resuming work. The server reads this key; never put it in `web/` code or commit `.env`. `LLM_MODEL_FAST` defaults to `gemini-3.8-flash`; Part 3 uses `LLM_MODEL_STRONG` (default `gemini-3.1-pro-preview`) for patches.

`POST /api/ai/explain` accepts `{ "runId": "..." }` with the same SyncVerse identity headers used by the web app. The run must exist and have a learner code error. Access is checked through Lane D's `canView` contract; while that lane is still a stub, only the run owner is allowed. The route uses the parser's error line, sends a small window of the relevant source to Gemini, validates the structured response, and returns an `Explanation`. Exact planted IndexError, NameError, and missing-colon SyntaxError examples have pre-seeded responses, so those samples still work before an API key is configured. Uncached Gemini requests are limited to 10 per user in each 10-minute window; successful responses are cached in memory for 30 minutes, and cache hits do not use that request allowance. These safeguards reset when the server restarts.

Rechecked on 2026-09-30 after the account handoff: Google's model-list endpoint returned HTTP 200 with this key, but the real explanation request returned provider HTTP 503. The real patch request returned a provider quota error (mapped to `503 ai_quota_exceeded` by this app). Live Gemini generation remains blocked; successful authentication and the health configuration flag do not prove generation works. The configured key stays in ignored local `.env`.

### Lane C explanation panel (Part 2)

Open the **AI** tab in the workspace. When Lane B sets `useWorkspace().lastRun` to a failed run, the panel offers **Explain with AI**, highlights the parser-reported line, and displays the explanation sections and concepts. It also shows loading, retry, no-run, and service-configuration states. The `AI can be wrong` note stays visible with every result. Until Lane B's run route stores results, the panel offers **Load sample into shared editor**: this replaces the shared editor contents with a fixed TypeError example but does not execute it. The matching synthetic run lets the panel call the Part 1 endpoint before Lane B lands. The AI request currently reaches Gemini, which is returning HTTP 503; normal failed runs still depend on Lane B records.

### Lane C patch review (Part 3)

Part 3's local sample workflow is implemented and verified on `lane-c-rahil`, ready for user review. Live Gemini generation and integration with Lane B's real runs remain pending. Parts 4 and 5 have not started.

**Demo:** Open http://localhost:5173/?name=Rahil&role=student&room=lane-c-review while `npm run dev` is running. This is a local demo on this computer, not a hosted deployment.

1. In the **AI** tab, choose **Load sample into shared editor**. It replaces the room's code with a labelled, non-executed TypeError example.
2. **Explain with AI** exercises the Part 1 gateway and Part 2 panel/highlight. With the current provider failure, expect a clear error instead of a generated explanation.
3. Choose **Suggest a patch** to see the Part 3 Monaco diff. For the exact built-in example, the proposal is explicitly labelled **SAMPLE PATCH · NOT AI GENERATED** and works without a Gemini call.
4. **Reject patch** keeps the document unchanged. Open another browser session in the same room, request the patch again, then **Accept patch**: the corrected source appears in both editors.
5. Edit the code in the second session while a preview is open. Accept becomes disabled; **Regenerate for current code** submits the latest source. Changed sample code uses the live Gemini path and will currently show its provider/quota error without applying a patch.

`POST /api/ai/patch` retains the `{runId}` contract, with optional `source` for regeneration against the current editor. It returns `patchedSource` plus review metadata (`baseSource`, `summary`, `sourceChangedSinceRun`, and `source`). Requests require owner/grantee access and a completed learner error. Empty, oversized, unchanged, fenced, or plainly unrelated output is rejected. Validation is a structural/relevance check, not proof of program correctness. Accept checks the current editor against `baseSource` immediately before `replaceAll`; Reject never calls `replaceAll`. `/api/ai/patch/decision` logs accepted/rejected decisions through Lane D's existing contract. The synthetic example uses the reserved `ai-demo` run room; real runs retain their own room.

Validation commands are kept in the Lane C folder to avoid edits to other lanes or shared package scripts:

```sh
node web/src/ai/check-api.cjs
node web/src/ai/check-browser.mjs
```

The API check uses fixture runs and mocked Gemini responses, requires no key, and covers the request contract, privacy, input/output validation, retries, quota errors, and decision events. The browser check needs the dev servers and installed Edge; it covers the real sample Accept/Reject flow in two browser contexts, stale previews, and labelled automated mocks for regeneration, in-flight edits, and provider failure. These tests do not establish live Gemini success. The handoff audit also fixed Monaco model cleanup when closing the diff.

Final Part 3 checks on 2026-09-30: 12 API checks PASS, 7 browser checks PASS with no browser runtime errors, server/web typecheck PASS, production build PASS. The existing large-bundle warning remains. Code and documentation are uncommitted on `lane-c-rahil`; user review is the next step.

Useful commands (run the checks while `npm run dev` is running, after every merge to main):

| Command | What it checks |
|---|---|
| `npm run typecheck` | server and web compile |
| `npm run build` | production build |
| `npm run smoke` | server health, Yjs sync/merge/presence/persistence (8 checks) |
| `npm run e2e` | two real Edge sessions: live editing, cursors, presence, markers (13 checks) |
| `npm run e2e:entry` | entry page: create/join flow, invite link, validation, phone/tablet layout, animated editor, workspace tabs and resizing (11 checks) |
| `npm run e2e:video` | video dock UI (real media needs LiveKit keys and two devices) |
| `npm run test:persist` | code survives a hard server restart (starts its own server on :4101) |
| `npm run e2e:reconnect` | server dies mid-session: offline edits merge after reconnect (starts its own servers on :4300/:5300) |

If an e2e run stalls while launching the browser, just run it again.

## Repository and branches

Repo: https://github.com/akshitsharma24-ux/SyncVerse

One branch per lane, all starting from the same skeleton commit:

| Branch | Owner | Lane |
|---|---|---|
| `lane-a-akshit` | Akshit | editor sync, presence, video, frontend design |
| `lane-b-simrit` | Simrit | run pipeline, console, code quality |
| `lane-c-rahil` | Rahil | AI explain and patch |
| `lane-d-miti` | Miti | debug access, progress, demo data |

```
git clone https://github.com/akshitsharma24-ux/SyncVerse.git
cd SyncVerse
git config core.autocrlf input
git checkout lane-b-simrit        # your own branch
npm install
copy .env.example .env            # then fill in your keys
npm run dev
```

- Work and push **only on your own lane branch**. Commit messages start with the task ID, for example `P-B1: poll Judge0 until done`.
- To pick up another lane's work: `git fetch origin` then `git merge origin/lane-a-akshit` (or whichever branch).
- Integration: at the first integration window (about 10:30 pm) create `main` from the most complete branch and merge the lanes into it one at a time, running `npm run smoke` and the e2e checks after each merge.
## Layout

```
shared/types.ts        contracts every lane imports (@syncverse/shared)
web/src/               Vite + React shell; one folder per lane (editor, video, console, quality, ai, debug, progress, demo)
server/                Express; routes/*.ts one file per lane; collab.ts is the Yjs WebSocket
docs/TRACKER.md        status + handoff;  docs/lanes/  one file per lane
scripts/smoke.mjs      automated checks
```



