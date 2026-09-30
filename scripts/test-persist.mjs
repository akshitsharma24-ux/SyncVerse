// Room persistence across a real server restart. Starts its own server on port 4101 (does not need npm run dev).
//   npm run test:persist
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

const PORT = 4101;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-persist-'));
const room = 'persist-' + Math.random().toString(36).slice(2, 7);
const results = [];
const servers = [];

function start() {
  const p = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(PORT), COLLAB_DATA_DIR: dir },
    stdio: 'ignore',
  });
  servers.push(p);
  return p;
}
async function until(pred, label, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out: ' + label);
}
const up = async () => {
  try {
    return (await fetch(`http://localhost:${PORT}/api/health`)).ok;
  } catch {
    return false;
  }
};
function client() {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(`ws://localhost:${PORT}/collab`, room, doc, { WebSocketPolyfill: WebSocket, disableBc: true });
  return { doc, provider, text: doc.getText('code') };
}
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};

try {
  let s = start();
  await until(up, 'server up');
  const a = client();
  await until(() => a.provider.synced, 'client synced');
  a.text.insert(a.text.length, '\n# survives a restart\n');
  await until(() => fs.existsSync(path.join(dir, `${room}.ydoc`)), 'room file written');
  await new Promise((r) => setTimeout(r, 1200)); // let the debounced save include the edit
  a.provider.destroy();
  s.kill();
  await new Promise((r) => s.once('exit', r));

  await check('room file is on disk after edits', () => {
    const size = fs.statSync(path.join(dir, `${room}.ydoc`)).size;
    if (size < 20) throw new Error('file too small: ' + size);
    return size + ' bytes';
  });

  s = start();
  await until(up, 'server up again');
  await check('after a hard restart the code is still there, starter not duplicated', async () => {
    const b = client();
    await until(() => b.provider.synced, 'client synced after restart');
    const t = b.text.toString();
    b.provider.destroy();
    if (!t.includes('# survives a restart')) throw new Error('edit lost: ' + JSON.stringify(t.slice(-40)));
    if (t.split('def average').length !== 2) throw new Error('starter duplicated');
  });
} catch (e) {
  results.push([false, 'test harness', String(e.message)]);
} finally {
  servers.forEach((p) => p.kill());
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.length && results.every((r) => r[0]) ? 0 : 1);
