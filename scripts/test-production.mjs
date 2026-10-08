// Verify the hosted entry point with isolated data and no external provider calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { tsImport } from 'tsx/esm/api';

const { computeEnvReport } = await tsImport('../server/env.ts', import.meta.url);
assert.equal(computeEnvReport({ NODE_ENV: 'production' }).ok, false);
assert.equal(computeEnvReport({ NODE_ENV: 'production', JUDGE0_URL: 'https://judge.example', RUNNER: 'local' }).ok, false);
assert.equal(computeEnvReport({ NODE_ENV: 'production', JUDGE0_URL: 'https://judge.example' }).ok, true);
console.log('PASS production requires sandboxed execution');

const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const dir = await mkdtemp(path.join(os.tmpdir(), 'syncverse-production-'));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/start.ts'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env, PORT: String(port), NODE_ENV: 'test', REQUIRE_AUTH: '1',
    AUTH_SECRET: 'production-test-secret-only', ADMIN_TOKEN: '',
    JUDGE0_URL: 'https://judge.example', JUDGE0_API_KEY: '', JUDGE0_API_HOST: '', RUNNER: '',
    LLM_API_KEY: '', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '',
    SYNCVERSE_DATA_DIR: dir, COLLAB_DATA_DIR: path.join(dir, 'rooms'), LOG_TO_FILE: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', data => { logs += data; });
child.stderr.on('data', data => { logs += data; });
let ws;
try {
  const deadline = Date.now() + 20000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    const up = await fetch(`${base}/api/health`).then(r => r.ok).catch(() => false);
    if (up) break;
    if (Date.now() > deadline) throw new Error(`Server did not start: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.accountsRequired, true);
  const root = await fetch(base);
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /A space to figure it out together/);
  assert.doesNotMatch(html, /\/src\/main\.tsx/);
  const script = /src="([^"\s]+\.js)"/.exec(html)?.[1];
  assert(script, 'Built entry script is linked');
  const asset = await fetch(base + script);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.equal(await (await fetch(`${base}/classroom/invite`)).text(), html);
  console.log('PASS built frontend, assets, and SPA routes work before sign-in');

  assert.equal((await fetch(`${base}/api/rooms`)).status, 401);
  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'production-check', password: 'LocalTest!7293' }),
  });
  assert.equal(registration.status, 201);
  const { token } = await registration.json();
  const headers = { authorization: `Bearer ${token}` };
  const missing = await fetch(`${base}/api/does-not-exist`, { headers });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'unknown route');
  const missingAsset = await fetch(`${base}/assets/missing.js`, { headers });
  assert.equal(missingAsset.status, 404);
  assert.notEqual(await missingAsset.text(), html);
  console.log('PASS account API, protected routes, and API/asset 404 behavior');

  ws = new WebSocket(`${base.replace('http:', 'ws:')}/collab/production-check?token=${encodeURIComponent(token)}`);
  await once(ws, 'open', { signal: AbortSignal.timeout(5000) });
  console.log('PASS authenticated collaboration WebSocket on the same port');
} finally {
  ws?.terminate();
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  await rm(dir, { recursive: true, force: true });
}
