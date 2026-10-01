// Step-through debugger API checks: the trace of correct and failing programs, recursion, input, infinite loops, syntax errors, the
// privacy rules (owner, active grant, revoke) and the live events a watching mentor receives. Starts its own server (port 4450) with
// the local runner (Python), so it needs no internet and no keys.
//   node scripts/test-trace.mjs                       (local runner)
//   TRACE_RUNNER=judge0 node scripts/test-trace.mjs   (the real Judge0 sandbox from .env; needs internet)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.TRACE_TEST_PORT ?? 4450);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-trace-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

const server = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
  cwd: path.resolve('server'),
  env: { ...process.env, PORT: String(PORT), RUNNER: process.env.TRACE_RUNNER ?? 'local', COLLAB_DATA_DIR: dataDir, TRACE_MIN_GAP_MS: '0' }, // TRACE_RUNNER=judge0 runs the same checks in the real sandbox
  stdio: 'ignore',
});
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {}
  await sleep(150);
}

const ROOM = 'trace-' + Math.random().toString(36).slice(2, 6);
const S = { id: 'u-asha', name: 'Asha', role: 'student' };
const M = { id: 'u-rao', name: 'Ms Rao', role: 'mentor' };
const X = { id: 'u-eve', name: 'Eve', role: 'student' };
const call = async (who, method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: { 'x-user-id': who.id, 'x-user-name': who.name, 'x-role': who.role, 'x-room': ROOM, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};
const trace = (who, source, stdin = '', extra = {}) => call(who, 'POST', '/api/debug/trace', { roomCode: ROOM, source, stdin, ...extra });

// the same program as the room's starter: a loop that goes one step too far
const INDEX_ERROR = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\nprint("start")\nprint(average([3, 4, 5]))\n';

await check('a failing program: the loop variable goes 0, 1, 2, 3 and the trace stops on the IndexError at line 4', async () => {
  const r = await trace(S, INDEX_ERROR);
  eq(r.status, 200, 'status: ' + JSON.stringify(r.json).slice(0, 200));
  const t = r.json;
  eq(t.error.type, 'IndexError', 'error type'); eq(t.error.line, 4, 'error line'); eq(t.language, 'python', 'language');
  const iValues = t.steps.filter((s) => s.f === 'average' && s.v.i !== undefined).map((s) => s.v.i);
  eq(iValues, ['0', '1', '2', '3'], 'i over time');
  const totals = t.steps.filter((s) => s.f === 'average' && s.v.total !== undefined).map((s) => s.v.total);
  eq(totals, ['0', '3', '7', '12'], 'total over time');
  ok(t.steps.some((s) => s.e && /IndexError/.test(s.e) && s.l === 4), 'the exception step is on line 4');
  eq(t.output, 'start\n', 'output so far (what ran before the error)');
  ok(t.steps.every((s) => typeof s.l === 'number' && typeof s.d === 'number' && typeof s.id === 'number'), 'well-formed steps');
  eq(t.truncated, false, 'not truncated');
});

await check('a correct program traces to the end: returns, a call stack and recursion keep their own frames', async () => {
  const src = 'def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nprint(fact(4))\n';
  const t = (await trace(S, src)).json;
  ok(!t.error, 'no error');
  eq(t.output, '24\n', 'output');
  eq(Math.max(...t.steps.map((s) => s.d)), 5, 'recursion depth: the program plus four calls');
  eq(new Set(t.steps.filter((s) => s.f === 'fact').map((s) => s.id)).size, 4, 'four separate frames');
  const returns = t.steps.filter((s) => s.r !== undefined && s.f === 'fact').map((s) => s.r);
  eq(returns, ['1', '2', '6', '24'], 'return values, innermost first');
  const last = t.steps[t.steps.length - 1];
  eq(last.f, '<module>', 'ends in the program'); eq(last.d, 1, 'back at depth 1');
});

await check('input() reads the stdin that was sent, and what the program prints is kept per step', async () => {
  const src = 'nums = list(map(int, input().split()))\nprint(sum(nums))\nprint("done")\n';
  const t = (await trace(S, src, '3 4 5\n')).json;
  ok(!t.error, 'no error');
  eq(t.output, '12\ndone\n', 'output');
  const steps = t.steps.filter((s) => s.l === 3);
  eq(steps[0].o, 3, 'before line 3 runs, "12\\n" (3 characters) was printed');
  eq(t.steps.find((s) => s.v.nums)?.v.nums, '[3, 4, 5]', 'the list shown');
});

await check('a variable is reported when it changes and again only when it changes (small traces)', async () => {
  const src = 'x = 1\ny = 2\nx = 1\nz = x + y\n';
  const t = (await trace(S, src)).json;
  const changes = t.steps.filter((s) => Object.keys(s.v).length).map((s) => s.v);
  eq(changes, [{ x: '1' }, { y: '2' }, { z: '3' }], 'only real changes are sent (x = 1 again is not a change)');
});

await check('big values stay short: a list of a million items costs the same as a list of ten', async () => {
  const src = 'big = list(range(1000000))\nbig2 = [big]\nword = "x" * 500\nprint(len(big))\n';
  const t = (await trace(S, src)).json;
  const v = t.steps.flatMap((s) => Object.entries(s.v));
  ok(v.every(([, val]) => val.length <= 80), 'every value is at most 80 characters');
  eq(t.output, '1000000\n', 'output');
});

await check('an infinite loop does not hang: the trace stops at the step limit and says so', async () => {
  const t0 = Date.now();
  const r = await trace(S, 'n = 0\nwhile True:\n    n += 1\n');
  eq(r.status, 200, 'status');
  eq(r.json.truncated, true, 'truncated'); eq(r.json.steps.length, 1500, 'step limit');
  ok(Date.now() - t0 < 8000, 'answered within 8 s');
});

await check('a syntax error has no steps but names the line', async () => {
  const t = (await trace(S, 'def broken(:\n    pass\n')).json;
  eq(t.steps.length, 0, 'no steps'); eq(t.error.type, 'SyntaxError', 'type'); eq(t.error.line, 1, 'line');
});

await check('a program that calls sys.exit() ends normally, and a caught exception is not an error', async () => {
  const a = (await trace(S, 'import sys\nprint("bye")\nsys.exit(0)\n')).json;
  ok(!a.error, 'sys.exit is not an error'); eq(a.output, 'bye\n', 'output');
  const b = (await trace(S, 'try:\n    1 / 0\nexcept ZeroDivisionError:\n    print("caught")\n')).json;
  ok(!b.error, 'no error'); eq(b.output, 'caught\n', 'output');
  ok(b.steps.some((s) => s.e && /ZeroDivisionError/.test(s.e)), 'the exception is still visible as a step');
});

await check('bad requests: other languages, empty code, huge code and huge input are refused with a message', async () => {
  const lang = await trace(S, 'print(1)', '', { language: 'java' });
  eq(lang.status, 400, 'language'); ok(/Python/.test(lang.json.message), 'the message says Python');
  eq((await trace(S, '   \n')).status, 400, 'empty');
  eq((await trace(S, 'x = 1\n'.repeat(30000))).status, 400, 'code over 100000 characters');
  eq((await trace(S, 'print(1)', 'x'.repeat(11000))).status, 400, 'input over 10 KB');
  eq((await call(S, 'POST', '/api/debug/trace', { roomCode: ROOM })).status, 400, 'no source');
  eq((await fetch(BASE + '/api/debug/trace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401, 'no identity');
});

await check('your own latest trace is yours; a stranger and an unapproved mentor get 403', async () => {
  await trace(S, INDEX_ERROR);
  const mine = await call(S, 'GET', '/api/debug/trace/latest');
  eq(mine.status, 200, 'own'); ok(mine.json.trace.source === INDEX_ERROR, 'it is the latest');
  eq((await call(X, 'GET', '/api/debug/trace/latest?ownerId=' + S.id)).status, 403, 'a stranger');
  eq((await call(M, 'GET', '/api/debug/trace/latest?ownerId=' + S.id)).status, 403, 'a mentor without access');
  eq((await call(X, 'GET', '/api/debug/trace/latest')).json.trace, null, 'someone who never debugged has none');
});

// ---- the live events a watching mentor gets
const events = [];
const ctl = new AbortController();
const listen = (async () => {
  try {
    const res = await fetch(`${BASE}/api/debug/events?room=${ROOM}`, { headers: { 'x-user-id': M.id, 'x-user-name': M.name, 'x-role': M.role, 'x-room': ROOM }, signal: ctl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(chunk)?.[1] ?? 'message';
        const data = /^data: (.+)$/m.exec(chunk)?.[1];
        if (data) events.push([ev, JSON.parse(data)]);
      }
    }
  } catch {}
})();
const heard = async (name, pred = () => true, ms = 3000) => {
  for (let i = 0; i < ms / 50; i++) {
    const e = events.find(([ev, d]) => ev === name && pred(d));
    if (e) return e[1];
    await sleep(50);
  }
  throw new Error(`no "${name}" event arrived`);
};

let grant;
await check('the mentor is told about the request path: no trace events before access, then access is granted', async () => {
  await trace(S, 'print(1)');
  await sleep(300);
  ok(!events.some(([ev]) => ev === 'trace'), 'a mentor without access heard about the trace');
  const req = await call(M, 'POST', '/api/debug/request', { ownerId: S.id, roomCode: ROOM });
  eq(req.json.status, 'requested', 'requested');
  const dec = await call(S, 'POST', `/api/debug/${req.json.id}/decision`, { allow: true });
  eq(dec.json.status, 'active', 'active');
  grant = dec.json;
  const read = await call(M, 'GET', '/api/debug/trace/latest?ownerId=' + S.id);
  eq(read.status, 200, 'the mentor can now read it'); eq(read.json.trace.ownerName, 'Asha', 'whose trace');
});

await check('with access: a new trace is announced to the mentor, and the student\'s position follows live', async () => {
  const r = await trace(S, INDEX_ERROR);
  const note = await heard('trace', (d) => d.id === r.json.id);
  eq(note.ownerName, 'Asha', 'name'); eq(note.error, 'IndexError', 'ends with'); ok(note.steps > 10, 'step count');
  eq((await call(S, 'POST', '/api/debug/trace/position', { id: r.json.id, step: 6 })).status, 200, 'position accepted');
  const step = await heard('trace-step', (d) => d.step === 6);
  eq(step.id, r.json.id, 'same trace');
  eq((await call(M, 'GET', '/api/debug/trace/latest?ownerId=' + S.id)).json.position, 6, 'a late joiner reads the position');
});

await check('only the owner moves the position, and only to a step that exists', async () => {
  const t = (await call(S, 'GET', '/api/debug/trace/latest')).json.trace;
  eq((await call(M, 'POST', '/api/debug/trace/position', { id: t.id, step: 1 })).status, 404, 'a mentor cannot move it');
  eq((await call(S, 'POST', '/api/debug/trace/position', { id: t.id, step: 9999 })).status, 400, 'out of range');
  eq((await call(S, 'POST', '/api/debug/trace/position', { id: 'nope', step: 0 })).status, 404, 'unknown trace');
});

await check('revoking access cuts the mentor off at once: no reading and no more live events', async () => {
  eq((await call(S, 'POST', `/api/debug/${grant.id}/revoke`)).json.status, 'revoked', 'revoked');
  eq((await call(M, 'GET', '/api/debug/trace/latest?ownerId=' + S.id)).status, 403, 'read refused');
  const before = events.length;
  await trace(S, 'print(2)');
  await call(S, 'POST', '/api/debug/trace/position', { id: (await call(S, 'GET', '/api/debug/trace/latest')).json.trace.id, step: 0 });
  await sleep(400);
  eq(events.slice(before).filter(([ev]) => ev === 'trace' || ev === 'trace-step').length, 0, 'events after the revoke');
});

await check('stepping through code is logged for the student\'s progress page as one neutral observation', async () => {
  const s = (await call(S, 'GET', '/api/progress/me')).json;
  ok(s.observations.some((o) => /stepped through your code \d+ times?/.test(o)), 'observations: ' + JSON.stringify(s.observations));
});

await check('two traces at once are refused for the same person, and the runner keeps working afterwards', async () => {
  const [a, b] = await Promise.all([trace(X, 'import time\nfor i in range(3):\n    time.sleep(0.2)\n'), trace(X, 'print(1)')]);
  eq([a.status, b.status].sort(), [200, 429], 'one runs, the other is told to wait');
  eq((await trace(X, 'print(3)')).status, 200, 'works again');
});

ctl.abort();
await listen;
stop();
fs.rmSync(dataDir, { recursive: true, force: true });
for (const [pass, name, d] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
console.log(`\n${results.filter((r) => r[0]).length} of ${results.length} checks passed`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
