// Lane C contract checks with fixture runs and a mocked provider; no real key or API calls.
// Run from the repository root: node web/src/ai/check-api.cjs
const assert = require('node:assert/strict');
require('tsx/cjs');
const express = require('express');
const { identity } = require('../../../server/identity.ts');
const runPath = require.resolve('../../../server/routes/run.ts');
require(runPath);
const originalRuns = require.cache[runPath].exports;
const source = 'scores = ["4"]\ntotal = scores[0] + 1\nprint(total)';
const fixed = source.replace('scores[0] + 1', 'int(scores[0]) + 1');
const fixture = { id: 'fixture', ownerId: 'owner', roomCode: 'lane-c-check', language: 'python',
  source, stdin: '', status: 'runtime_error', stdout: '', stderr: 'TypeError: text plus number',
  compileOutput: '', errorLine: 2, createdAt: Date.now() };
require.cache[runPath].exports = { ...originalRuns, getRun: (id) => id === fixture.id ? fixture : undefined };
process.env.LLM_API_KEY = 'test-only-placeholder';
process.env.LLM_MODEL_STRONG = 'test-strong';
const { router } = require('../../../server/routes/ai.ts');
const { getEvents } = require('../../../server/routes/events.ts');
const realFetch = global.fetch;
let calls = [];
let reply = () => ({ applicable: true, summary: 'Convert the numeric string.', patchedSource: fixed });
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
  fixture.source = source;
  fixture.status = 'runtime_error';
  reply = () => ({ applicable: true, summary: 'Convert the numeric string.', patchedSource: fixed });
  await fn();
  passed++;
  console.log('PASS ' + name);
}
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (body, user = fixture.ownerId, endpoint = 'patch') => {
    const r = await realFetch(base + '/api/ai/' + endpoint, { method: 'POST',
      headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user, 'x-user-name': 'Fixture', 'x-role': 'student' } : {}) },
      body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  try {
    await check('runId-only contract uses stored source', async () => {
      const r = await post({ runId: fixture.id });
      assert.equal(r.status, 200); assert.equal(r.body.patchedSource, fixed);
      assert.equal(r.body.baseSource, source); assert.equal(r.body.source, 'gemini');
      assert.equal(calls[0].generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
    });
    await check('current source extension preserves new code in generation context', async () => {
      const current = source + '\n# collaborator note';
      reply = () => ({ applicable: true, summary: 'Minimal fix.', patchedSource: fixed + '\n# collaborator note' });
      const r = await post({ runId: fixture.id, source: current });
      assert.equal(r.status, 200); assert.equal(r.body.baseSource, current);
      assert.equal(r.body.sourceChangedSinceRun, true);
      assert.ok(calls[0].contents[0].parts[0].text.includes('collaborator note'));
    });
    await check('explicit sample is labelled and makes no provider call', async () => {
      const r = await post({ runId: 'syncverse-ai-demo-typeerror' });
      assert.equal(r.status, 200); assert.equal(r.body.source, 'sample'); assert.equal(calls.length, 0);
    });
    await check('empty/oversized supplied or stored sources are rejected', async () => {
      for (const value of ['', '   ', 'x'.repeat(30001)]) {
        assert.equal((await post({ runId: fixture.id, source: value })).status, 400);
        fixture.source = value;
        assert.equal((await post({ runId: fixture.id })).status, 400);
      }
      assert.equal(calls.length, 0);
    });
    await check('missing identity and unauthorized runs cannot request patches', async () => {
      assert.equal((await post({ runId: fixture.id }, '')).status, 401);
      assert.equal((await post({ runId: fixture.id }, 'stranger')).status, 403);
      assert.equal((await post({ runId: 'missing' })).status, 404);
      assert.equal(calls.length, 0);
    });
    await check('non-learner failures do not reach the provider', async () => {
      for (const status of ['success', 'queued', 'running', 'service_error']) {
        fixture.status = status;
        assert.ok([400, 409].includes((await post({ runId: fixture.id })).status));
      }
      assert.equal(calls.length, 0);
    });
    await check('empty, unchanged, fenced and unrelated patch output is rejected', async () => {
      for (const output of ['', source, '```python\n' + fixed + '\n```', 'completely unrelated prose with no program']) {
        reply = () => ({ applicable: true, summary: 'Bad patch.', patchedSource: output });
        const r = await post({ runId: fixture.id });
        assert.equal(r.status, 422); assert.equal(r.body.code, 'ai_patch_rejected');
      }
    });
    await check('non-applicable output leaves the caller without a patch', async () => {
      reply = () => ({ applicable: false, summary: 'Rerun the current code first.', patchedSource: source });
      assert.equal((await post({ runId: fixture.id })).body.code, 'ai_patch_not_applicable');
    });
    await check('malformed JSON is retried once and then fails cleanly', async () => {
      reply = () => Response.json({ candidates: [{ content: { parts: [{ text: 'not JSON' }] } }] });
      assert.equal((await post({ runId: fixture.id })).status, 502); assert.equal(calls.length, 2);
    });
    await check('schema validation retries and can recover', async () => {
      reply = () => calls.length === 1 ? { summary: 'Missing required fields.' } :
        { applicable: true, summary: 'Minimal correction.', patchedSource: fixed };
      assert.equal((await post({ runId: fixture.id })).status, 200); assert.equal(calls.length, 2);
    });
    await check('provider quota is reported without a fabricated patch', async () => {
      reply = () => Response.json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }, { status: 429 });
      const r = await post({ runId: fixture.id });
      assert.equal(r.status, 503); assert.equal(r.body.code, 'ai_quota_exceeded'); assert.equal(calls.length, 1);
    });
    await check('accept and reject log distinct decisions with run ownership enforced', async () => {
      const count = getEvents().length;
      for (const accepted of [false, true]) {
        assert.equal((await post({ runId: fixture.id, accepted }, fixture.ownerId, 'patch/decision')).status, 200);
      }
      assert.equal((await post({ runId: fixture.id, accepted: true }, 'stranger', 'patch/decision')).status, 403);
      const decisions = getEvents().slice(count);
      assert.deepEqual(decisions.map(e => e.ok), [false, true]);
      assert.ok(decisions.every(e => e.type === 'patch' && e.roomCode === fixture.roomCode));
    });
    console.log(`${passed} Lane C API checks passed (mocked Gemini, fixture run store).`);
  } finally {
    global.fetch = realFetch;
    require.cache[runPath].exports = originalRuns;
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
