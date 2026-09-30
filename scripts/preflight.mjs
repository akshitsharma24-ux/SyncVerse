// Pre-demo warm-up and "are my keys working?" check. Run with the dev servers up:  npm run preflight
//   --strict   warnings count as failures (use on demo morning)
//   --no-llm   skip the tiny live LLM call (costs a fraction of a cent)
// Prints [ OK ] / [WARN] / [FAIL] / [SKIP] per item. Exit code 1 on any FAIL. Owner: Lane A (shared).
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

dotenv.config({ path: '.env' });
const STRICT = process.argv.includes('--strict');
const NO_LLM = process.argv.includes('--no-llm');
const API = process.env.SMOKE_BASE ?? 'http://localhost:4000';
const WEB = process.env.E2E_BASE ?? 'http://localhost:5173';
const rows = [];
const add = (level, label, detail = '') => rows.push({ level, label, detail });
const env = (k) => (process.env[k] ?? '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

// ---------------------------------------------------------------------------------------------- machine
const major = Number(process.versions.node.split('.')[0]);
add(major >= 20 ? 'OK' : 'FAIL', 'Node.js', `v${process.versions.node}${major >= 20 ? '' : ' (need 20 or newer)'}`);
add(fs.existsSync('node_modules') ? 'OK' : 'FAIL', 'Dependencies installed', fs.existsSync('node_modules') ? '' : 'run: npm install');
add(fs.existsSync('.env') ? 'OK' : 'WARN', '.env file', fs.existsSync('.env') ? '' : 'missing: copy .env.example to .env and add your keys');
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).split('\n').filter(Boolean).length;
  add(dirty ? 'WARN' : 'OK', 'Git', `branch ${branch}, ${dirty ? dirty + ' uncommitted change(s)' : 'clean'}`);
} catch {
  add('SKIP', 'Git', 'not a git repository');
}
try {
  fs.mkdirSync('server/data/rooms', { recursive: true });
  fs.writeFileSync('server/data/rooms/.preflight', 'ok');
  fs.rmSync('server/data/rooms/.preflight');
  add('OK', 'Room storage writable', 'server/data/rooms');
} catch (e) {
  add('FAIL', 'Room storage writable', String(e.message));
}

// ---------------------------------------------------------------------------------------------- our servers
let health = null;
try {
  const t0 = Date.now();
  health = await withTimeout(fetch(`${API}/api/health`).then((r) => r.json()), 4000, 'API');
  add('OK', 'API server', `${API} answered in ${Date.now() - t0} ms`);
} catch (e) {
  add('FAIL', 'API server', `${API} not reachable (${e.message}). Start it with: npm run dev`);
}
try {
  const r = await withTimeout(fetch(WEB), 4000, 'web app');
  add(r.ok ? 'OK' : 'FAIL', 'Web app', `${WEB} HTTP ${r.status}`);
} catch (e) {
  add('FAIL', 'Web app', `${WEB} not reachable (${e.message}). Start it with: npm run dev`);
}
if (health) {
  try {
    const proxied = await withTimeout(fetch(`${WEB}/api/health`).then((r) => r.json()), 4000, 'proxy');
    add(proxied.ok ? 'OK' : 'FAIL', 'Web -> API proxy', '/api goes through the web server');
  } catch (e) {
    add('FAIL', 'Web -> API proxy', e.message);
  }
  // live editing round trip through the real WebSocket
  const room = 'preflight-' + Math.random().toString(36).slice(2, 6);
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(API.replace(/^http/, 'ws') + '/collab', room, doc, { WebSocketPolyfill: WebSocket, disableBc: true });
  try {
    const t0 = Date.now();
    while (!provider.synced && Date.now() - t0 < 5000) await sleep(50);
    const text = doc.getText('code').toString();
    add(provider.synced && text.includes('def average') ? 'OK' : 'FAIL', 'Live editing (Yjs WebSocket)', provider.synced ? `synced in ${Date.now() - t0} ms` : 'did not sync within 5 s');
  } finally {
    provider.destroy();
  }
}

// ---------------------------------------------------------------------------------------------- Judge0 (Lane B)
if (!env('JUDGE0_URL')) {
  add('WARN', 'Judge0 code runner', 'JUDGE0_URL is not set in .env (Lane B / P-B0)');
} else {
  try {
    const base = env('JUDGE0_URL').replace(/\/+$/, '');
    const headers = { 'content-type': 'application/json' };
    if (env('JUDGE0_API_HOST')) {
      headers['X-RapidAPI-Key'] = env('JUDGE0_API_KEY');
      headers['X-RapidAPI-Host'] = env('JUDGE0_API_HOST');
    } else if (env('JUDGE0_API_KEY')) {
      headers['X-Auth-Token'] = env('JUDGE0_API_KEY');
    }
    const t0 = Date.now();
    const langs = await withTimeout(fetch(`${base}/languages`, { headers }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('GET /languages HTTP ' + r.status)))), 8000, 'Judge0 /languages');
    const py = langs.find((l) => /^Python \(3/.test(l.name));
    if (!py) throw new Error('no "Python (3.x)" in /languages');
    const sub = await withTimeout(
      fetch(`${base}/submissions?base64_encoded=true&wait=false`, { method: 'POST', headers, body: JSON.stringify({ language_id: py.id, source_code: Buffer.from('print(1 + 1)').toString('base64') }) }),
      8000,
      'Judge0 submit',
    );
    if (!sub.ok) throw new Error('submit HTTP ' + sub.status);
    const { token } = await sub.json();
    let result = null;
    for (let i = 0; i < 30 && !result; i++) {
      await sleep(500);
      const r = await fetch(`${base}/submissions/${token}?base64_encoded=true`, { headers });
      const j = await r.json();
      if (j.status && j.status.id >= 3) result = j;
    }
    if (!result) throw new Error('no result within 15 s');
    const out = Buffer.from(result.stdout ?? '', 'base64').toString().trim();
    add(out === '2' ? 'OK' : 'FAIL', 'Judge0 code runner', `${py.name} (id ${py.id}) ran print(1 + 1) -> "${out}" in ${Date.now() - t0} ms; status ${result.status.description}`);
  } catch (e) {
    add('FAIL', 'Judge0 code runner', e.message + '. Fallback: local subprocess runner (plan section 7.3)');
  }
}

// ---------------------------------------------------------------------------------------------- LiveKit (Lane A / D)
if (!(env('LIVEKIT_URL') && env('LIVEKIT_API_KEY') && env('LIVEKIT_API_SECRET'))) {
  add('WARN', 'LiveKit video', 'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET not all set in .env (Miti / P-D0)');
} else {
  try {
    const { AccessToken } = await import('livekit-server-sdk');
    const at = new AccessToken(env('LIVEKIT_API_KEY'), env('LIVEKIT_API_SECRET'), { identity: 'preflight' });
    at.addGrant({ roomJoin: true, room: 'sv-preflight' });
    const jwt = await at.toJwt();
    const host = env('LIVEKIT_URL').replace(/^wss?:\/\//, 'https://');
    let reach = 'server not probed';
    try {
      const r = await withTimeout(fetch(host), 6000, 'LiveKit host');
      reach = `host answered HTTP ${r.status}`;
    } catch (e) {
      throw new Error(`token OK but ${host} is not reachable (${e.message})`);
    }
    add(jwt.split('.').length === 3 ? 'OK' : 'FAIL', 'LiveKit video', `token minted; ${reach}. A real call still needs two devices.`);
  } catch (e) {
    add('FAIL', 'LiveKit video', e.message);
  }
}

// ---------------------------------------------------------------------------------------------- LLM (Lane C)
if (!env('LLM_API_KEY')) {
  add('WARN', 'LLM (AI tutor)', 'LLM_API_KEY is not set in .env (Rahil / P-C0)');
} else if (NO_LLM) {
  add('SKIP', 'LLM (AI tutor)', 'key is set; live call skipped (--no-llm)');
} else {
  add('SKIP', 'LLM (AI tutor)', 'key is set; test your provider with its own hello-world (P-C0), there is no built-in live check');
}

// ---------------------------------------------------------------------------------------------- report
const tag = { OK: '[ OK ]', WARN: '[WARN]', FAIL: '[FAIL]', SKIP: '[SKIP]' };
for (const r of rows) console.log(`${tag[r.level]} ${r.label.padEnd(30)} ${r.detail}`);
const count = (l) => rows.filter((r) => r.level === l).length;
console.log(`\nPreflight: ${count('OK')} ok, ${count('WARN')} warning(s), ${count('FAIL')} failing, ${count('SKIP')} skipped${STRICT ? '  (strict: warnings fail)' : ''}`);
process.exit(count('FAIL') > 0 || (STRICT && count('WARN') > 0) ? 1 : 0);
