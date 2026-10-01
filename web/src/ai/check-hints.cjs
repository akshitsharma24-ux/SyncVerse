// Hint ladder contract checks (POST /api/ai/hints and /api/ai/hints/step) with fixture runs and a mocked provider; no real key.
// Run from the repository root: node web/src/ai/check-hints.cjs
const assert = require('node:assert/strict');
require('tsx/cjs');
const express = require('express');
const { identity } = require('../../../server/identity.ts');
const { ruleHints } = require('../../../server/hints.ts');
const runPath = require.resolve('../../../server/routes/run.ts');
require(runPath);
const originalRuns = require.cache[runPath].exports;
const source = 'prices = {"a": 1}\ntotal = prices["b"] + 1\nprint(total)';
const fixture = { id: 'fixture', ownerId: 'owner', roomCode: 'hint-check', language: 'python',
  source, stdin: '', status: 'runtime_error', stdout: '', stderr: 'KeyError: \'b\'',
  compileOutput: '', errorLine: 2, createdAt: Date.now() };
require.cache[runPath].exports = { ...originalRuns, getRun: (id) => id === fixture.id ? fixture : undefined };
process.env.LLM_API_KEY = 'test-only-placeholder';
const { router } = require('../../../server/routes/ai.ts');
const { getEvents } = require('../../../server/routes/events.ts');
const realFetch = global.fetch;
let calls = [];
let reply = () => ({});
global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, options);
  calls.push(JSON.parse(options.body));
  const result = reply();
  if (result instanceof Response) return result;
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
};
const app = express();
app.use(express.json());
app.use(identity);
app.use('/api', router);
let passed = 0;
async function check(name, fn) {
  calls = [];
  fixture.ownerId = 'owner-' + passed;
  fixture.source = source + '\n# case ' + passed; // a different source per check: the explanation cache is keyed on it
  fixture.status = 'runtime_error';
  fixture.stderr = "KeyError: 'b'";
  fixture.errorLine = 2;
  process.env.LLM_API_KEY = 'test-only-placeholder';
  reply = () => ({});
  await fn();
  passed++;
  console.log('PASS ' + name);
}
const EXPLANATION = {
  what: 'The program looked up a key that is not in the dictionary.',
  why: 'prices has only the key "a", but line 2 asks for "b".',
  plain: 'A dictionary only knows the keys that were put into it.',
  fix: 'Use prices.get("b", 0) or add the key first.',
  snippet: 'total = prices.get("b", 0) + 1',
  concepts: ['dictionaries'],
  nudge: 'The program asked a dictionary for something it never stored.',
  question: 'Which keys does prices hold when line 2 runs, and is "b" one of them?',
};
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (endpoint, body, user = fixture.ownerId) => {
    const r = await realFetch(base + '/api/ai/' + endpoint, { method: 'POST',
      headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user, 'x-user-name': 'Fixture', 'x-role': 'student' } : {}) },
      body: JSON.stringify(body) });
    return { status: r.status, body: await r.json(), source: r.headers.get('x-ai-source') };
  };
  try {
    await check('with the AI available, one call serves the hints and the fix: rung 3 is a cache hit', async () => {
      reply = () => EXPLANATION;
      const h = await post('hints', { runId: fixture.id });
      assert.equal(h.status, 200); assert.equal(h.body.source, 'gemini');
      assert.equal(h.body.hints.nudge, EXPLANATION.nudge); assert.equal(h.body.hints.question, EXPLANATION.question);
      assert.equal(calls.length, 1);
      const e = await post('explain', { runId: fixture.id });
      assert.equal(e.status, 200); assert.equal(e.source, 'cache'); assert.equal(calls.length, 1, 'the explanation came from the cache');
      assert.equal(e.body.fix, EXPLANATION.fix);
      assert.deepEqual(e.body.hints, { nudge: EXPLANATION.nudge, question: EXPLANATION.question });
      const again = await post('hints', { runId: fixture.id });
      assert.equal(again.body.source, 'cache'); assert.equal(calls.length, 1);
    });
    await check('the hints are asked for in the prompt and in the schema, and never reveal the fix', async () => {
      reply = () => EXPLANATION;
      await post('hints', { runId: fixture.id });
      const prompt = calls[0].contents[0].parts[0].text;
      assert.match(prompt, /nudge/); assert.match(prompt, /question/); assert.match(prompt, /may reveal the fix|without saying how to fix/);
      const props = calls[0].generationConfig.responseFormat.text.schema.properties;
      assert.ok(props.nudge && props.question);
    });
    await check('if the model leaves the hints out, rule-based ones stand in (the explanation still validates)', async () => {
      const { nudge, question, ...without } = EXPLANATION;
      reply = () => without;
      const e = await post('explain', { runId: fixture.id });
      assert.equal(e.status, 200);
      assert.match(e.body.hints.nudge, /dictionary/i); assert.match(e.body.hints.question, /line 2/);
    });
    await check('if the AI is down or out of quota, hints still arrive (from the error message) instead of an error', async () => {
      reply = () => Response.json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }, { status: 429 });
      const h = await post('hints', { runId: fixture.id });
      assert.equal(h.status, 200); assert.equal(h.body.source, 'rules');
      assert.match(h.body.hints.nudge, /dictionary/i);
    });
    await check('with no AI key at all, hints are rule-based and make no provider call', async () => {
      delete process.env.LLM_API_KEY;
      const h = await post('hints', { runId: fixture.id });
      assert.equal(h.status, 200); assert.equal(h.body.source, 'rules'); assert.equal(calls.length, 0);
    });
    await check('the built-in IndexError answer has built-in hints: the question quotes the loop, the nudge keeps the fix back', async () => {
      delete process.env.LLM_API_KEY;
      fixture.source = 'def f(nums):\n    for i in range(len(nums) + 1):\n        print(nums[i])\nf([1, 2, 3])';
      fixture.stderr = 'IndexError: list index out of range'; fixture.errorLine = 3;
      const h = await post('hints', { runId: fixture.id });
      assert.equal(h.body.source, 'sample'); assert.equal(calls.length, 0);
      assert.match(h.body.hints.question, /range\(len\(nums\) \+ 1\)/);
      for (const text of [h.body.hints.nudge, h.body.hints.question]) assert.ok(!/range\(len\(nums\)\):/.test(text), 'the fixed loop must not appear');
    });
    await check('permissions and bad requests: strangers 403, unknown run 404, successful or running runs and bad bodies refused', async () => {
      assert.equal((await post('hints', { runId: fixture.id }, '')).status, 401);
      assert.equal((await post('hints', { runId: fixture.id }, 'stranger')).status, 403);
      assert.equal((await post('hints', { runId: 'missing' })).status, 404);
      assert.equal((await post('hints', {})).status, 400);
      assert.equal((await post('hints', { runId: fixture.id, extra: 1 })).status, 400);
      for (const status of ['success', 'queued', 'running', 'service_error']) {
        fixture.status = status;
        assert.ok([400, 409].includes((await post('hints', { runId: fixture.id })).status), status);
      }
      assert.equal(calls.length, 0);
    });
    await check('asking for hints and climbing the ladder are logged as hint events (nudge, question, fix); nothing else is', async () => {
      delete process.env.LLM_API_KEY;
      const count = getEvents().length;
      await post('hints', { runId: fixture.id });
      assert.equal((await post('hints/step', { runId: fixture.id, step: 'question' })).status, 200);
      assert.equal((await post('hints/step', { runId: fixture.id, step: 'fix' })).status, 200);
      assert.equal((await post('hints/step', { runId: fixture.id, step: 'nudge' })).status, 400);
      assert.equal((await post('hints/step', { runId: fixture.id, step: 'fix' }, 'stranger')).status, 403);
      const events = getEvents().slice(count);
      assert.deepEqual(events.map((e) => [e.type, e.category]), [['hint', 'nudge'], ['hint', 'question'], ['hint', 'fix']]);
      assert.ok(events.every((e) => e.roomCode === fixture.roomCode && e.userId === fixture.ownerId));
    });
    await check('rule-based hints cover the common errors in every language, name the line, and never hand over a fix', async () => {
      const cases = [
        ['IndexError: list index out of range', /position/i],
        ['Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3', /position/i],
        ["KeyError: 'x'", /dictionary|map/i],
        ["NameError: name 'mesage' is not defined", /name/i],
        ['ReferenceError: totl is not defined', /name/i],
        ["error: 'totl' undeclared (first use in this function)", /name/i],
        ['error: cannot find symbol', /name/i],
        ["TypeError: can only concatenate str (not \"int\") to str", /different kinds/i],
        ["TypeError: Cannot read properties of undefined (reading 'marks')", /undefined|nothing/i],
        ['java.lang.NullPointerException', /nothing|null/i],
        ['ZeroDivisionError: division by zero', /zero/i],
        ['Exception in thread "main" java.lang.ArithmeticException: / by zero', /zero/i],
        ['Floating point exception (core dumped)', /zero/i],
        ['RecursionError: maximum recursion depth exceeded', /calling itself/i],
        ['java.lang.StackOverflowError', /calling itself/i],
        ['RangeError: Maximum call stack size exceeded', /calling itself/i],
        ['Segmentation fault (core dumped)', /memory/i],
        ['Time limit exceeded (5 s). Check for an infinite loop.', /loop|time/i],
        ['SyntaxError: invalid syntax', /read|punctuation/i],
        ["error: ';' expected", /read|punctuation/i],
        ['IndentationError: unexpected indent', /read|punctuation|indentation/i],
        ['EOFError: EOF when reading a line', /input/i],
        ['java.util.NoSuchElementException', /input/i],
        ['ValueError: invalid literal for int() with base 10: \'abc\'', /content/i],
        ["AttributeError: 'list' object has no attribute 'push'", /object/i],
        ['Something nobody has seen before happened', /last line of the error message/i],
      ];
      for (const [error, want] of cases) {
        const h = ruleHints(error, 7);
        assert.match(h.nudge, want, error);
        assert.ok(h.question.includes('?'), 'a question: ' + error);
        assert.ok(h.nudge.length > 30 && h.question.length > 30, 'not empty: ' + error);
      }
      assert.match(ruleHints('IndexError: x', 7).question, /line 7/);
      assert.match(ruleHints('IndexError: x').question, /line the error points to/);
    });
    console.log(`${passed} hint ladder checks passed (mocked Gemini, fixture run store).`);
  } finally {
    global.fetch = realFetch;
    require.cache[runPath].exports = originalRuns;
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
