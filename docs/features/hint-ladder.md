# Hint ladder (optional step-by-step help)

In the **Understand** tool, after a failed run, there are three separate ways to get help. None of them needs another:

- **Explain with AI**: the whole explanation and the fix at once.
- **Suggest a patch**: a proposed correction in a side-by-side diff that you Accept or Reject.
- **Guide me with hints**: a Socratic ladder for people who want to work it out themselves (below).

It works for DSA practice or for debugging a big program: use the ladder when you want to think first, the direct buttons when you just
want the answer.

![The hint ladder at the last rung](../images/hint-ladder.png)

## The ladder

1. **Nudge**: what happened, in concept, without the fix. For a loop that goes one step too far: "The loop asked for a position that does
   not exist: a list with 3 items has positions 0, 1 and 2."
2. **Guiding question**: opens with "Need another hint?". It points at the line and the value to look at: "What is the biggest value `i`
   takes in `range(len(nums) + 1)`? Is that a valid position in `nums`?"
3. **The fix**: opens with "Still stuck? Show the fix". The full explanation appears, and a patch button on the ladder opens the same
   reviewed preview as the direct path.

"Leave the ladder" and "Skip the hints and explain it directly" are always there, and a new run closes the ladder.

## Where the hints come from

- The AI call that explains the error also writes the nudge and the question (`hints` on the `Explanation`), instructed never to reveal
  the fix. One request serves all three rungs because the answer is cached.
- The built-in answers for the planted IndexError, NameError and missing-colon bugs have hand-written hints.
- For any other error, and whenever the AI is down, over quota or not configured, **rule-based hints written from the error message** take
  over (`server/hints.ts`): index and key errors, names, null and undefined, types, values, division by zero, recursion and stack overflow,
  time limit, syntax and input errors, in Python, Java, JavaScript, C and C++. So rungs 1 and 2 always work; rung 3 needs the AI or a
  built-in answer and says so when it cannot load.

## API

`POST /api/ai/hints {runId}` returns `{ hints: { nudge, question }, source }` where `source` is `gemini`, `sample`, `cache` or `rules`.
`POST /api/ai/hints/step {runId, step: question|fix}` records how far someone climbed. Both are logged as `hint` events; the Progress page
adds one neutral observation ("You asked for step-by-step hints N times and opened the fix M times"), never a score.

Code: `web/src/ai/HintLadder.tsx`, `web/src/ai/hints.css`, `server/hints.ts`, `server/routes/ai.ts`.

## Tests

`node web/src/ai/check-hints.cjs` (API with a mocked provider, including 26 error texts in all five languages) and `npm run e2e:hints`
(browsers with no AI key: the direct path unchanged, the three rungs, skip, leave, patch from the ladder, rule-based hints, phone layout,
accessibility).
