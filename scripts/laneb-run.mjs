// Lane B (Simrit) API checks for P-B1: run pipeline. Starts its own servers (does not need npm run dev).
//   node scripts/laneb-run.mjs            uses JUDGE0_URL from .env (public Judge0)
//   node scripts/laneb-run.mjs --local    uses the local Python fallback runner
import { spawn } from 'node:child_process';
import path from 'node:path';

const LOCAL = process.argv.includes('--local');
const results = [];
const servers = [];

function start(port, env) {
  const p = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(port), ...(LOCAL ? { RUNNER: 'local' } : {}), ...env },
    stdio: 'ignore',
  });
  servers.push(p);
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(port) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('server did not start on ' + port);
}
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const user = (n) => ({ 'x-user-id': 'u-' + n, 'x-user-name': n, 'x-role': 'student' });
async function call(port, who, method, p, body) {
  const res = await fetch(`http://localhost:${port}${p}`, {
    method,
    headers: { ...(who ? user(who) : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}
async function runAndWait(port, who, source, stdin = '') {
  const r = await call(port, who, 'POST', '/api/run', { roomCode: 'room1', language: 'python', source, stdin });
  eq(r.status, 202, 'POST /api/run status');
  for (let i = 0; i < 70; i++) {
    await sleep(400);
    const g = await call(port, who, 'GET', '/api/run/' + r.json.id);
    if (g.json && g.json.status !== 'queued' && g.json.status !== 'running') return g.json;
  }
  throw new Error('run did not finish in 28 s');
}

const A = 4401; // fast limits
const B = 4402; // default rate limits
const C = 4403; // unreachable Judge0
try {
  start(A, { RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000' });
  start(B, {});
  if (!LOCAL) start(C, { JUDGE0_URL: 'http://127.0.0.1:9' });
  await up(A);
  await up(B);
  if (!LOCAL) await up(C);

  const STARTER = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';

  await check('run-info reports the runner', async () => {
    const r = await call(A, null, 'GET', '/api/run-info');
    eq(r.json.runner, LOCAL ? 'local' : 'judge0', 'runner');
    eq(r.json.sandboxed, !LOCAL, 'sandboxed');
    return `${r.json.runner}, sandboxed=${r.json.sandboxed}`;
  });
  await check('no identity header -> 401', async () => {
    eq((await call(A, null, 'POST', '/api/run', { roomCode: 'r', source: 'print(1)' })).status, 401, 'status');
  });
  await check('hello-world -> success, stdout "1"', async () => {
    const r = await runAndWait(A, 'ann', 'print(1)');
    eq(r.status, 'success', 'status');
    eq(r.stdout, '1\n', 'stdout');
    return `${r.timeMs} ms`;
  });
  await check('stdin program (21 -> 42)', async () => {
    const r = await runAndWait(A, 'ann', 'n = int(input())\nprint(n * 2)', '21');
    eq(r.status, 'success', 'status');
    eq(r.stdout, '42\n', 'stdout');
  });
  await check('unicode round-trips', async () => {
    const r = await runAndWait(A, 'ann', 'print("héllo ✓")');
    eq(r.stdout, 'héllo ✓\n', 'stdout');
  });
  await check('infinite loop -> timeout', async () => {
    const r = await runAndWait(A, 'bob', 'while True:\n    pass\n');
    eq(r.status, 'timeout', 'status');
  });
  await check('missing colon -> compile_error with SyntaxError in stderr', async () => {
    const r = await runAndWait(A, 'cat', 'def greet(name)\n    print(name)\n');
    eq(r.status, 'compile_error', 'status');
    if (!/SyntaxError/.test(r.stderr)) throw new Error('stderr lacks SyntaxError: ' + r.stderr);
    eq(r.errorLine, 1, 'errorLine');
    if (!/^SyntaxError/.test(r.errorMessage ?? '')) throw new Error('errorMessage: ' + r.errorMessage);
  });
  await check('NameError -> runtime_error', async () => {
    const r = await runAndWait(A, 'cat', 'total = 0\nprint(totl)\n');
    eq(r.status, 'runtime_error', 'status');
    if (!/NameError/.test(r.stderr)) throw new Error('stderr lacks NameError');
    eq(r.errorLine, 2, 'errorLine');
  });
  await check('IndexError starter -> runtime_error', async () => {
    const r = await runAndWait(A, 'cat', STARTER);
    eq(r.status, 'runtime_error', 'status');
    if (!/IndexError/.test(r.stderr)) throw new Error('stderr lacks IndexError');
    eq(r.errorLine, 4, 'errorLine (the golden-path sample)');
    eq(r.errorMessage, 'IndexError: list index out of range', 'errorMessage');
  });
  await check('RecursionError -> runtime_error, errorLine 2', async () => {
    const r = await runAndWait(A, 'cat', 'def f(n):\n    return f(n + 1)\nprint(f(0))\n');
    eq(r.status, 'runtime_error', 'status');
    eq(r.errorLine, 2, 'errorLine');
    if (!/RecursionError/.test(r.errorMessage ?? '')) throw new Error('errorMessage: ' + r.errorMessage);
  });
  await check('successful run has no errorLine / errorMessage', async () => {
    const r = await runAndWait(A, 'cat', 'print(2)');
    eq(r.errorLine, undefined, 'errorLine');
    eq(r.errorMessage, undefined, 'errorMessage');
  });
  await check('huge output is truncated to 64 KB', async () => {
    const r = await runAndWait(A, 'dan', "print('x' * 200000)");
    eq(r.status, 'success', 'status');
    if (r.stdout.length > 64 * 1024 + 40 || !/truncated/.test(r.stdout)) throw new Error('length ' + r.stdout.length);
  });

  let idOfAsha;
  await check('three users run the same file with different stdin; each sees only their own output', async () => {
    const src = 'name = input()\nprint("hi " + name)\n';
    const [a, b, c] = await Promise.all([runAndWait(A, 'asha', src, 'Asha'), runAndWait(A, 'ben', src, 'Ben'), runAndWait(A, 'cy', src, 'Cy')]);
    eq(a.stdout, 'hi Asha\n', 'asha');
    eq(b.stdout, 'hi Ben\n', 'ben');
    eq(c.stdout, 'hi Cy\n', 'cy');
    idOfAsha = a.id;
    eq(a.ownerId, 'u-asha', 'owner');
  });
  await check('privacy: others get 403; unknown id 404; latest is per user', async () => {
    eq((await call(A, 'ben', 'GET', '/api/run/' + idOfAsha)).status, 403, 'ben reads asha run');
    eq((await call(A, 'asha', 'GET', '/api/run/' + idOfAsha)).status, 200, 'asha reads own run');
    eq((await call(A, 'asha', 'GET', '/api/run/does-not-exist')).status, 404, 'unknown id');
    eq((await call(A, 'ben', 'GET', '/api/runs/latest?ownerId=u-asha')).status, 403, 'ben latest of asha');
    const mine = await call(A, 'asha', 'GET', '/api/runs/latest');
    eq(mine.json.id, idOfAsha, 'asha latest');
    eq((await call(A, 'nobody', 'GET', '/api/runs/latest')).json, null, 'no runs -> null');
  });
  await check('bad input -> 400 (oversize stdin, empty code, no room, unsupported language)', async () => {
    const post = (b) => call(A, 'eve', 'POST', '/api/run', b);
    eq((await post({ roomCode: 'r', source: 'print(1)', stdin: 'x'.repeat(10 * 1024 + 1) })).status, 400, 'stdin');
    eq((await post({ roomCode: 'r', source: '   \n' })).status, 400, 'empty');
    eq((await post({ source: 'print(1)' })).status, 400, 'room');
    eq((await post({ roomCode: 'r', language: 'cobol', source: 'x' })).status, 400, 'language');
    eq((await post({ roomCode: 'r', source: 'x'.repeat(100001) })).status, 400, 'source size');
  });
  await check('a user cannot have more than 2 runs in flight', async () => {
    const post = () => call(A, 'flo', 'POST', '/api/run', { roomCode: 'r', source: 'import time\ntime.sleep(2)\nprint(1)' });
    const s = [(await post()).status, (await post()).status, (await post()).status];
    eq(s.join(','), '202,202,429', 'statuses');
    await sleep(9000); // let them finish
  });
  await check('rate limit: a second run within 2 s -> 429', async () => {
    const post = () => call(B, 'gus', 'POST', '/api/run', { roomCode: 'r', source: 'print(1)' });
    eq((await post()).status, 202, 'first');
    eq((await post()).status, 429, 'second');
  });
  if (LOCAL) {
    await check('local runner hides server secrets from student code', async () => {
      const r = await runAndWait(A, 'ivy', 'import os\nprint(os.environ.get("JUDGE0_URL"), os.environ.get("LLM_API_KEY"))');
      eq(r.stdout, 'None None\n', 'stdout');
    });
  }
  if (!LOCAL) {
    await check('runner down -> service_error, server keeps working', async () => {
      const r = await runAndWait(C, 'hal', 'print(1)');
      eq(r.status, 'service_error', 'status');
      eq((await fetch(`http://localhost:${C}/api/health`)).ok, true, 'health after failure');
      return r.stderr;
    });
  }
} finally {
  for (const s of servers) s.kill();
}
let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed (${LOCAL ? 'local runner' : 'Judge0'})`);
process.exit(failed ? 1 : 0);
