# AI tutor (Understand tool)

The **Understand** tool explains a failed run to a beginner, helps them reason it out with a hint ladder, and proposes a correction that
the student reviews before anything changes. Providers: Google Gemini through the server (the key never reaches the browser).

## What it offers

When a run fails, the console records it and the tool shows it ("Error reported on line 4"), highlights the parser-reported line in the
editor, and offers three paths that each work on their own:

| Path | What happens |
|---|---|
| **Explain with AI** | An `Explanation`: what happened, why, in plain terms, a fix and a minimal snippet, plus concept tags. |
| **Suggest a patch** | A side-by-side Monaco diff of the whole file. **Accept** applies it to the shared editor (one transaction, so everyone sees it); **Reject** changes nothing. |
| **Guide me with hints** | The optional Socratic ladder: nudge, guiding question, then the fix. See [hint-ladder.md](hint-ladder.md). |

"AI can be wrong" stays visible with every answer, and the student always decides whether a patch is applied.

## Behaviour worth knowing

- **Built-in answers.** The planted IndexError (a loop that goes one step too far), NameError and missing-colon SyntaxError examples have
  pre-written explanations and exact patches, labelled **SAMPLE PATCH · NOT AI GENERATED** where they apply, so the demo's headline bugs work
  with no key and no network.
- **Grounded in the parser.** The error line comes from the run's parser, never from the model; only a window of about 80 lines around it is sent.
  Code, errors and input are passed as untrusted data, and every answer is validated against a strict schema (one retry on malformed output).
- **Stale previews are caught.** If the shared code changes while a preview is open, Accept is disabled until the preview is regenerated from the
  current code; Accept re-checks the editor against the preview's base immediately before applying.
- **Limits.** Successful explanations are cached for 30 minutes (identical requests share one provider call); uncached requests are limited to
  10 per person per 10 minutes. Patches are rejected if empty, unchanged, fenced in Markdown or plainly unrelated to the source.
- **Errors are plain.** Provider trouble becomes a clear message (not configured, quota exceeded, busy, timed out) and never a made-up answer.
- **Privacy.** A run is explained only for its owner or a mentor with an active debug grant; accepted and rejected patches are logged as
  learning events.

## API

| Route | What |
|---|---|
| `POST /api/ai/explain` | `{ runId }` returns an `Explanation` (`x-ai-source`: `sample`, `cache` or `gemini`) |
| `POST /api/ai/patch` | `{ runId, source? }` returns `{ summary, baseSource, patchedSource, sourceChangedSinceRun, source }` |
| `POST /api/ai/patch/decision` | `{ runId, accepted }` logs the student's decision |
| `POST /api/ai/hints`, `/api/ai/hints/step` | the hint ladder |

## Configuration

Set `LLM_API_KEY` in `.env`. `LLM_MODEL_FAST` (default `gemini-3.8-flash`) writes explanations and hints; `LLM_MODEL_STRONG` (default
`gemini-3.1-pro-preview`) writes patches. Without a key the built-in answers and the rule-based hints still work.

Code: `server/routes/ai.ts`, `server/hints.ts`, `web/src/ai/`.

## Tests

`node web/src/ai/check-api.cjs` (the API contract with a mocked provider and no key), `node web/src/ai/check-hints.cjs` (hints),
`node web/src/ai/check-browser.mjs` (patch review in two browsers, needs the dev servers) and `npm run e2e:hints`. `npm run preflight`
makes one real explanation request with the configured key.
