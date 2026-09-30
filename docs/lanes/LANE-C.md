# Lane C - AI explain and patch  (owner: Rahil)

Read `CLAUDE.md` and `docs/TRACKER.md` first. Update the tracker when you start and finish each task.

**Folders you may edit:** `web/src/ai/`, `server/routes/ai.ts`

**Start without waiting:** Build against the stubs: test the gateway with curl or a scratch script using a hand-made `RunResult` until Lane B's runs exist. `useWorkspace().lastRun` is what your panel reads. `useEditor().replaceAll(text)` applies a patch.

Clock windows assume a 5:30 pm start. MUST tasks are the demo; SHOULD tasks only when the golden path is green on main.

## P-C0 - LLM hello-world  [SETUP, 1.0 h, 5:30 pm-6:30 pm]

Get an LLM key and set a spending cap. From a scratch script make one call that returns JSON matching the Explanation type and time it. Draft the prompt against the IndexError sample.

**Done when:** One structured Explanation comes back in under 6 s and the key is in .env, not in git.

**Blueprint tasks:** T-00-01, T-C-01

## P-C1 - LLM gateway and explain  [MUST, 2.0 h, 6:30 pm-8:30 pm]

`server/routes/ai.ts`: provider adapter, code and error sent as quoted data, zod-validated JSON with one retry, 15 s timeout, cache by hash of language + error + code, and pre-seeded answers for the planted samples. `POST /api/ai/explain {runId}` (owner or grantee only) returns an Explanation. Calls `logEvent`.

**Done when:** The NameError, IndexError and SyntaxError samples return a correct beginner-level explanation pointing at the right line, cached ones instantly.

**Needs:** P-C0

**Blueprint tasks:** T-C-01, T-C-02

## P-C2 - AI panel  [MUST, 1.0 h, 8:30 pm-9:30 pm]

Explain with AI button on any failed run (reads `lastRun`), card with what / where / why / fix / snippet, line highlight via the editor, loading and error states, 'AI can be wrong' note.

**Done when:** A failed run becomes a card and a highlighted line in one click.

**Needs:** P-C1, P-B2 (stub lastRun ok)

**Blueprint tasks:** T-C-02

## P-C3 - Patch preview, Accept or Reject  [MUST, 1.5 h, 9:30 pm-10:30 pm, 11:30 pm-12 am]

`POST /api/ai/patch {runId}` returns the corrected source (stronger model, minimal change, rejected if empty or unrelated). Web: Monaco DiffEditor in a modal; Accept calls `replaceAll` so every collaborator gets it; Reject changes nothing; if the document changed since the run, regenerate. Logs the decision.

**Done when:** Reject leaves the document untouched; Accept appears in the second browser.

**Needs:** P-C1, P-A2 handle

**Blueprint tasks:** T-C-03

## P-C4 - Hint mode  [SHOULD, 1.0 h, 12 am-1 am]

Three-tier ladder in the AI panel: nudge, guiding question, near-answer. Tiers 1 and 2 must not contain code (prompt rule plus a check for code fences).

**Done when:** Tier 1 and 2 never show the fix.

**Needs:** P-C2

**Blueprint tasks:** T-C-06

## P-C5 - AI answer check  [SHOULD, 0.5 h, 1 am-1:30 am]

Run the eight planted samples, read the answers, fix prompts, refresh the cache.

**Done when:** At least 7 of 8 answers are correct and fast.

**Needs:** P-C1

**Blueprint tasks:** T-C-10

## Test hooks and shared data for Lane C (added after the first push)

Put these `data-testid` names on your UI (full contract: `docs/TESTIDS.md`): `ai-panel` (root, add it first), `explain-button`, `explain-card`,
`patch-show`, `patch-diff`, `patch-accept`, `patch-reject`. Reject must leave the editor text exactly unchanged; Accept must call `useEditor().replaceAll(...)`.

Shared data you can use today: `fixtureExplanations` and `SAMPLES[i].explanation` are correct, beginner-level answers for the failing planted programs
(use them as your pre-baked cache and as your evaluation set), `fixtureRuns.runtime_error` is a realistic input, `conceptsForCategory` and `CONCEPTS`
give you the concept slugs to tag with, `useToast()` for "Patch applied". Your steps in the demo test: G5 (explain) and G6 (patch) in `npm run e2e:golden`.

