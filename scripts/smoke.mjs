// Automated smoke checks. Run with the dev server up:  npm run smoke
// Owner: Lane A. Add a check here when your task lands (keep each check small and independent).
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000';
const WS_BASE = BASE.replace(/^http/, 'ws') + '/collab';
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}

async function until(pred, label, ms = 5000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

// ------------------------------------------------------------------------------------------ Lane A: server
await check('server health', async () => {
  const r = await fetch(`${BASE}/api/health`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error('ok=false');
  return JSON.stringify(j.configured);
});

await check('unknown api route is 404', async () => {
  const r = await fetch(`${BASE}/api/definitely-not-a-route`);
  if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
});

// ------------------------------------------------------------------------------------------ Lane A: Yjs sync
function client(room) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(WS_BASE, room, doc, { WebSocketPolyfill: WebSocket, disableBc: true });
  return { doc, provider, text: doc.getText('code') };
}

const room = 'smoke-' + Math.random().toString(36).slice(2, 8);
const a = client(room);
const b = client(room);

await check('yjs: two clients sync and receive the starter program once', async () => {
  await until(() => a.provider.synced && b.provider.synced, 'both clients synced');
  const t = a.text.toString();
  if (!t.startsWith('def average')) throw new Error('starter missing: ' + JSON.stringify(t.slice(0, 40)));
  if (t !== b.text.toString()) throw new Error('clients differ');
  if (t.split('def average').length !== 2) throw new Error('starter inserted more than once');
});

await check('yjs: an edit in A appears in B', async () => {
  a.text.insert(0, '# from A\n');
  await until(() => b.text.toString().startsWith('# from A'), 'B sees A edit');
});

await check('yjs: concurrent edits both survive (CRDT merge)', async () => {
  a.text.insert(a.text.length, 'A_END');
  b.text.insert(b.text.length, 'B_END');
  await until(() => a.text.toString() === b.text.toString() && a.text.toString().includes('A_END') && a.text.toString().includes('B_END'), 'merged');
});

await check('yjs: replaceAll as one transaction reaches the other client', async () => {
  a.doc.transact(() => {
    a.text.delete(0, a.text.length);
    a.text.insert(0, 'REPLACED');
  });
  await until(() => b.text.toString() === 'REPLACED', 'B sees replacement');
});

await check('awareness: cursor/presence state is shared, then removed on disconnect', async () => {
  a.provider.awareness.setLocalStateField('user', { name: 'Akshit', color: '#1565a8' });
  const aId = a.doc.clientID;
  await until(() => b.provider.awareness.getStates().get(aId)?.user?.name === 'Akshit', 'B sees A presence');
  a.provider.destroy();
  await until(() => !b.provider.awareness.getStates().has(aId), 'A presence removed after disconnect');
});

await check('room keeps its text after everyone leaves (refresh does not lose code)', async () => {
  b.provider.destroy();
  const c = client(room);
  await until(() => c.provider.synced, 'C synced');
  const t = c.text.toString();
  c.provider.destroy();
  if (t !== 'REPLACED') throw new Error('expected REPLACED, got ' + JSON.stringify(t.slice(0, 40)));
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  - ' + r.detail : ''}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
