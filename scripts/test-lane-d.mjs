// Lane D API test: starts its own server on :4400. Run: node scripts/test-lane-d.mjs
import { spawn } from 'node:child_process';
const PORT = 4400, B = `http://localhost:${PORT}/api`;
const srv = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, PORT }, shell: true, stdio: 'ignore' });
let fails = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const H = (id, name, role) => ({ 'x-user-id': id, 'x-user-name': name, 'x-role': role, 'content-type': 'application/json' });
const S = H('s1', 'Stu', 'student'), M = H('m1', 'Mia', 'mentor'), T = H('t1', 'Third', 'student');
const call = async (m, p, h, b) => { const r = await fetch(B + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  let r = await call('POST', '/debug/request', M, { ownerId: 's1', roomCode: 'r' });
  ok('request -> requested', r.j.status === 'requested'); const id = r.j.id;
  ok('third user cannot decide', (await call('POST', `/debug/${id}/decision`, T, { allow: true })).s === 403);
  ok('mentor cannot self-approve', (await call('POST', `/debug/${id}/decision`, M, { allow: true })).s === 403);
  r = await call('POST', `/debug/${id}/decision`, S, { allow: true });
  ok('owner allows -> active with expiry', r.j.status === 'active' && r.j.expiresAt > Date.now());
  r = await call('POST', `/debug/${id}/revoke`, S);
  ok('owner revokes', r.j.status === 'revoked');
  ok('third user cannot revoke', (await call('POST', `/debug/${id}/revoke`, T)).s === 403);
  r = await call('POST', '/debug/request', M, { ownerId: 's1', roomCode: 'r' });
  r = await call('POST', `/debug/${r.j.id}/decision`, S, { allow: false });
  ok('deny -> denied', r.j.status === 'denied');
  const M2 = H('m2', 'Max', 'mentor'); let last;
  for (const o of ['a', 'b', 'c', 'd']) last = await call('POST', '/debug/request', M2, { ownerId: o, roomCode: 'r' });
  ok('4th request in window -> 429', last.s === 429);
  r = await call('POST', '/demo/seed', S, { roomCode: 'r' });
  ok('seed adds events', r.j.seeded > 0);
  r = await call('GET', '/progress/me?room=r', S);
  ok('observation: retry recommended', r.j.observations.some(o => o.startsWith('Retry recommended')));
  ok('students 403 on room table', (await call('GET', '/progress/room?room=r', S)).s === 403);
  r = await call('GET', '/progress/room?room=r', M);
  ok('mentor table has stuck Asha', r.j.rows.some(x => x.name.startsWith('Asha') && x.stuck));
} finally { srv.kill(); spawn('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { shell: true }); }
console.log(fails ? 'FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
