# PlanLaneC — Lane C Work Plan and Handoff

**Project:** SyncVerse  
**Lane:** C — AI assistance  
**Current working branch:** `lane-c-rahil`  
**Purpose:** Keep Lane C work continuous across accounts and reviews, and give the next chat a precise place to resume.

**Latest key update:** The user supplied a replacement Gemini key after the Part 3 review handoff. It is configured in ignored local `.env`; dev servers were restarted. Testing of this replacement is left to the user as requested. The generation failures below refer to the previous key, and the replacement's generation status is unverified. Part 4 still awaits approval.

**Latest continuation — 2026-09-30:** The new account resumed and verified Part 3. Its sample workflow is ready for user review; live Gemini generation remains blocked. See the current resume instructions below. Earlier handoff observations are retained as history, not as unfinished instructions to repeat.

## How to use this document

This document records the five staged Lane C plans and the current handoff state. The next chat should also read the project’s `CONTRIBUTING.md`, `README.md`, and `docs/TRACKER.md`, then compare this plan with the two supplied PDFs: `SyncVerse_Master_Blueprint.pdf` and `SyncVerse_Overnight_Prototype_Plan.pdf`. Those documents provide project requirements and context; the user’s messages determine what work is authorized and the order in which to do it.

The user asked for the work to proceed one part at a time, with a review on their side after each part. Finish and document one part, provide the running demo link and explain where to see that part’s changes, then wait for the user’s review and approval before starting the next part. This handoff does **not** authorize starting Part 4.

## Lane and change-preservation rules

- Continue on `lane-c-rahil` and keep work in Lane C for as long as practical to reduce merge conflicts.
- Lane C implementation belongs in `web/src/ai/` and `server/routes/ai.ts`, subject to the current `CONTRIBUTING.md` lane rules. Update `README.md` and `docs/TRACKER.md` to document verified progress.
- Preserve the existing working tree. Do not reset, clean, stash, overwrite, switch branches, merge another lane, or push changes as part of resuming this handoff.
- Do not commit `.env`, print its contents, or copy the Gemini key into documentation or source. The local `.env` is ignored by Git. Reuse it if it exists; ask the user only if a required credential is unavailable.
- Do not claim that a real Gemini generation works based only on successful authentication or a model-list request. Verify the actual generation operation and report provider/quota errors accurately.
- Use the sample patch only as a clearly labelled demo path. Never present a sample response as Gemini-generated output.

## Five-part plan

The parts build on each other. Each part should be reviewed before work begins on the next one.

### Part 1 — AI gateway and explanation foundation

**Purpose:** Establish a safe server-side path from SyncVerse to Gemini and define how the app explains an error or selected code context.

**Work:** Configure the Gemini model through environment variables; keep the key on the server; validate requests and responses; bound input and handle missing-key, provider, quota, and malformed-response errors. Return a useful explanation tied to the submitted context. Keep sample/development behavior clearly identified.

**Improvement:** Adds an AI explanation capability on top of the Lane A editor while keeping provider access out of browser code.

**Review evidence:** Show an explanation in the app, indicate where the user can find it, and distinguish a real Gemini response from any sample path. Update the README and tracker with verified behavior and known provider limits.

### Part 2 — Workspace AI panel and explanation flow

**Purpose:** Make the gateway usable from the collaborative editor.

**Work:** Add the Lane C AI panel and its loading, success, empty, and error states. Let the user request an explanation using the relevant editor context; show the response and make its source clear. Keep the layout usable alongside the existing editor and video dock.

**Improvement over Part 1:** Turns the server capability into a visible in-product workflow, so users can request and inspect help without leaving the workspace.

**Review evidence:** Demonstrate the panel in the running app, including a usable sample path if live Gemini generation is blocked. Identify the UI location and update the README and tracker.

### Part 3 — Reviewable patch preview and explicit decision

**Purpose:** Let a user inspect a proposed fix before it changes shared code.

**Work:** For a run, `POST /api/ai/patch {runId}` requests a stronger-model patch, checks that it is non-empty and relevant, and avoids applying stale output. Show the proposed change in a Monaco diff modal. **Accept** applies the change with `replaceAll` so collaborators receive it; **Reject** leaves the editor unchanged. If the document changed since the run, require a fresh proposal. Log the user’s decision. Sample patch content must be labelled as a sample.

**Improvement over Part 2:** Moves from explanation to a suggested code change, while adding a visible review step and an explicit user decision before shared code changes.

**Review evidence:** Verify Reject leaves the editor unchanged; verify Accept applies the patch and the change appears in a second browser; verify stale output is not applied. Test actual Gemini patch generation when quota permits. Update the README and tracker with results and limitations.

### Part 4 — Progressive hint mode

**Purpose:** Help users understand and solve a problem progressively instead of immediately showing a complete fix.

**Work:** Add a three-tier hint flow. Tiers 1 and 2 must contain no code: start with a conceptual nudge, then give more specific reasoning or steps. The final tier can reveal a concrete fix or connect to the Part 3 patch review flow. Keep each reveal user-controlled.

**Improvement over Part 3:** Adds a learning path and gives the user control over how much assistance to reveal before seeing a full solution.

**Review evidence:** Demonstrate all three tiers, confirm tiers 1 and 2 contain no code, and show how the user advances or stops. Update the README and tracker after verification.

### Part 5 — Seeded quality and responsiveness evaluation

**Purpose:** Check that Lane C assistance is useful across a small, repeatable set of known cases.

**Work:** Run eight planted examples through the supported assistance flow. Record whether the answer is correct and relevant, whether it points to useful code/lines, and response time. The plan’s target is at least 7 of 8 correct, with responses fast enough for an interactive workflow. Keep sample-mode results separate from real Gemini results.

**Improvement over Part 4:** Measures the complete assistance experience against repeatable examples and gives the team evidence for its accuracy and responsiveness.

**Review evidence:** Provide the eight-case results, failures, timing summary, and any remaining limits. Do not claim the target was met without recorded results. Update the README and tracker.

## Exact handoff: where the next account starts

**Current stop point: Part 3 is ready for user review using the labelled sample. Parts 4 and 5 are not started.** The Part 3 audit requested at the account switch has now been carried out. README and tracker have been updated. The next chat should:

1. Read `CONTRIBUTING.md`, `docs/lanes/LANE-C.md`, `README.md`, `docs/TRACKER.md`, and this document. Use the two PDFs as scope references; the overnight plan supplies the prototype contracts, while the master blueprint includes broader future work.
2. Confirm the project root is `C:\Users\HP\OneDrive\Desktop\tsec\SyncVerse` and `git branch --show-current` is `lane-c-rahil`. Inspect status and diff; preserve the existing uncommitted implementation, documentation, and verification scripts.
3. If the user reports a Part 3 issue, reproduce and repair that issue within Lane C. The repeatable checks are `node web/src/ai/check-api.cjs` and, with dev servers running, `node web/src/ai/check-browser.mjs`. Do not rebuild completed work or rerun checks without a reason.
4. If the user has not reviewed Part 3 yet, show the demo described below and wait for their review. Begin Part 4 only when they explicitly approve it; implement its three-tier hint ladder as described in the plan above.
5. Keep Gemini's generation limitation visible. The resumed session rechecked authentication (model-list HTTP 200), but live explanations still returned provider HTTP 503 and the stronger patch request still failed for unavailable quota. The app reports this as `503 ai_quota_exceeded`. Fixing quota/billing is an external prerequisite; do not change billing settings or claim a sample is real generation. Retest the actual generation endpoints when the configuration/provider state changes.
6. Update README, tracker, and this current resume point when work advances. Preserve the key in ignored `.env`. Continue on the lane branch; no merge, push, or commit was performed during this continuation.

### What was completed after the account switch

- Compared the partial implementation with both PDFs and the lane contracts. Kept the existing Parts 1–3 implementation and the uncommitted changes from the previous account.
- Restored the agreed `POST /api/ai/patch {runId}` contract. `source` is now optional; the web panel supplies it when regenerating against current shared code. Both supplied and stored source are checked for emptiness and the 30,000-character limit.
- Added stale detection while the modal is open. Remote edits disable Accept, and the final source comparison still runs immediately before `replaceAll`.
- Fixed Monaco diff cleanup discovered by browser testing. The panel now owns its Monaco diff view model, cancels it, and detaches it before disposing text models. Rapid preview/close and regeneration produced no runtime errors in the final browser check.
- Added `web/src/ai/check-api.cjs`: 12 passing checks using fixture runs and mocked Gemini responses for contract compatibility, permission enforcement, invalid input/output, retries, quota handling, and decision logs. It does not use the local API key.
- Added `web/src/ai/check-browser.mjs`: 7 passing checks with two real Edge contexts. Sample preview, Reject, Accept, and cross-browser synchronization call the real local API; regeneration, delayed response, and quota-error scenarios use explicit automated mocks. These are workflow checks, not live Gemini quality results.
- Final server/web typecheck and production build passed after the Monaco fix. The existing bundle-size warning remains. No unrelated regression suites or Part 5 answer-quality evaluation were claimed as completed.
- Rechecked the actual configured Gemini key without displaying it. Model-list authentication succeeded; live generation remains blocked as described above. The generation request format was checked against Google's REST documentation: https://ai.google.dev/api/generate-content#TextResponseFormat.

### Review the three completed implementation parts together

Run `npm run dev` from the project root if needed. Open `http://localhost:5173/?name=Rahil&role=student&room=lane-c-review` on this computer and select the **AI** tab.

1. **Load sample into shared editor** loads the fixed TypeError example. It is labelled as not executed and changes the shared room's code.
2. **Explain with AI** exercises Part 1's gateway and Part 2's panel/error/highlight flow. With the currently failing provider, the expected result is its error message; a generated explanation is not currently verified.
3. **Suggest a patch** opens Part 3's labelled sample diff without Gemini. Reject preserves the code. Accept converts the text value with `int(...)` and synchronizes the correction to another browser in the same room.
4. For stale protection, open a preview and edit the code in the other browser. Accept becomes disabled. Regeneration sends the new code; because edited samples leave the built-in fixture path, this currently encounters the live provider/quota limitation.

The demo URL is local to this computer; it is not a public deployment. The real failed-run integration still awaits Lane B. Lane D's existing `logEvent` stores decisions; its progress UI and active grants are still stubs in this branch. The synthetic sample uses the reserved `ai-demo` run room, while ordinary runs use their recorded room.

### Working-tree preservation

At the time this plan was prepared, the branch was `lane-c-rahil`, tracking `origin/lane-c-rahil`, with no new commit made for the Lane C changes. These tracked files were modified:

- `.env.example`
- `README.md`
- `docs/TRACKER.md`
- `server/routes/ai.ts`
- `web/src/ai/index.tsx`

`PlanLaneC.md`, `web/src/ai/check-api.cjs`, and `web/src/ai/check-browser.mjs` are additional uncommitted files. The local `.env` is ignored and must remain private. The continuation modified the existing Lane C files and documentation; `.env.example` retained its earlier changes. Check current status in the next account rather than assuming this snapshot has not changed.

### Historical snapshot before the account switch

The working tree already contains the Part 3 endpoint and UI flow: patch generation/validation, decision logging, a read-only diff modal, accept/reject behavior, stale-result handling, and an explicitly labelled synthetic sample path. At the handoff, `npm run typecheck` and `npm run build` had passed; the build reported an existing large-bundle warning. A two-browser synthetic-flow check passed: Reject left both editors unchanged, while Accept applied the patch and synchronized it to the other browser.

At that earlier stop, live Gemini generation was **not verified as working**, and the README and tracker had not yet been updated for Part 3. The continuation above supersedes that documentation gap and reverified the provider limitation. No commit or merge has been made. Confirm the local development app is running before sharing a demo link.

### Relevant files

- `CONTRIBUTING.md` — repository and lane instructions
- `README.md` — project setup and progress notes
- `docs/TRACKER.md` — lane/part status
- `web/src/ai/index.tsx` — Lane C AI workspace UI
- `server/routes/ai.ts` — Lane C AI API routes
- `.env.example` — documented environment variable names (no secrets)

