# Lane D - Debug access, progress, demo data  (owner: Miti)

Read `CLAUDE.md` and `docs/TRACKER.md` first. Update the tracker when you start and finish each task.

**Folders you may edit:** `web/src/debug/`, `web/src/progress/`, `web/src/demo/`, `server/routes/debug.ts`, `server/routes/events.ts`

**Start without waiting:** Build against the stubs: `usePresence()` returns [] until P-A3 lands (hard-code test users meanwhile), and `canView` / `logEvent` stubs already exist with their final signatures. Ask Lane A for the LiveKit keys you create in P-D0.

Clock windows assume a 5:30 pm start. MUST tasks are the demo; SHOULD tasks only when the golden path is green on main.

## P-D0 - LiveKit keys and samples  [SETUP, 1.0 h, 5:30 pm-6:30 pm]

Create a LiveKit Cloud project, mint one token from a scratch script, and hand URL + keys to Lane A for P-A4. Write the planted-bug sample programs (section 7.2). Sketch the debug-access states on paper.

**Done when:** A scratch script prints a valid token; keys are shared with A; five sample .py files exist.

**Blueprint tasks:** T-00-01, T-D-07

## P-D1 - Permission-gated debug access  [MUST, 2.5 h, 6:30 pm-9 pm]

`server/routes/debug.ts`: in-memory grants (request, allow, deny, revoke, 30 min expiry), `canView(viewerId, ownerId)`, and an SSE stream per user. Web: a Request access button per person (from `usePresence`), a modal for the owner (Allow / Deny), a banner 'X is viewing your session - Revoke', and a read-only view of the owner's latest run for the grantee.

**Done when:** Request, allow, mentor sees the student's output, revoke clears it instantly, and a third user gets 403 on the same data.

**Needs:** P-A1 stubs; real runs from P-B1

**Blueprint tasks:** T-D-02 (lite)

## P-D2 - Learning events and progress  [MUST, 1.5 h, 9 pm-10:30 pm]

`server/routes/events.ts` owns `logEvent` and aggregates; progress page shows runs, success rate, error categories (simple bars), AI help used, and observation sentences from the rule in section 4.4. Mentor table: per student runs, failures, top error. No scores or ranks; a 'what we record' note.

**Done when:** After the demo flow the page shows believable observations.

**Needs:** P-A1 stubs; events from B and C

**Blueprint tasks:** T-D-03, T-D-04 (lite)

## P-D3 - Samples and seed data  [MUST, 0.5 h, 11:30 pm-12 am]

Planted-bug sample menu that loads a program via `replaceAll`, and seed events so the progress page has history on a fresh start.

**Done when:** Picking a sample loads it for everyone; a fresh start shows seeded history.

**Needs:** P-A2 handle, P-D2

**Blueprint tasks:** T-D-07 (lite)

## P-D4 - Mentor overview tiles  [SHOULD, 1.5 h, 12 am-1:30 am]

One tile per participant: presence, last-run status, failed-run streak, stuck flag after three failures, Request access button. Status only, never output.

**Done when:** A mentor spots a stuck student without opening their session.

**Needs:** P-D1, P-D2

**Blueprint tasks:** T-A-09, T-D-09

## Status: built and merged into main

Lane D is finished and merged into `main` (one squashed commit credited to Miti). Its real test hooks (`debug-panel`, `request-<userId>`, `access-modal`, `allow`, `viewing-banner`, `revoke`, `mirror`, `progress-panel`, `observations`, `samples-btn` ...) are listed in `docs/TESTIDS.md` and exercised by `npm run e2e:golden` (steps G2b and G9 run today; G8 needs Lane B's run routes). Your own tests: `node scripts/test-lane-d.mjs` (25 API checks) and `node scripts/e2e-lane-d.mjs` (18 browser checks).

After the merge reset your branch to main: `git fetch origin`, `git checkout lane-d-miti`, `git reset --hard origin/main`.

