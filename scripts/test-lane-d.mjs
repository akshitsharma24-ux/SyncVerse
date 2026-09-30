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
  r = await call('POST', '/debug/request', H('m3', 'Mo', 'mentor'), { ownerId: 's1', roomCode: 'r' });
  await call('POST', `/debug/${r.j.id}/block`, S);
  ok('blocked requester gets 403', (await call('POST', '/debug/request', H('m3', 'Mo', 'mentor'), { ownerId: 's1', roomCode: 'r' })).s === 403);
  await call('POST', '/help', S, { roomCode: 'r' });
  r = await call('GET', '/progress/room?room=r', M);
  ok('help flag on mentor row', r.j.rows.some((x) => x.userId === 's1' && x.helpRequested));
  r = await call('GET', '/progress/trends?room=r', M);
  ok('trends: Asha struggled with loop boundaries', r.j.trends.some((t) => t.concept === 'loop boundaries' && t.struggling >= 1));
  ok('students 403 on trends', (await call('GET', '/progress/trends?room=r', S)).s === 403);
  // assist scope: highlight only with assist; view-only is refused
  const P = H('p1', 'Pat', 'student'), Q = H('q1', 'Quin', 'mentor');
  r = await call('POST', '/debug/request', Q, { ownerId: 'p1', roomCode: 'r' });
  const gid = r.j.id;
  await call('POST', `/debug/${gid}/decision`, P, { allow: true });
  ok('view-only grant refuses highlight', (await call('POST', `/debug/${gid}/highlight`, Q, { line: 3 })).s === 403);
  await call('POST', `/debug/${gid}/revoke`, P);
  r = await call('POST', '/debug/request', Q, { ownerId: 'p1', roomCode: 'r' });
  r = await call('POST', `/debug/${r.j.id}/decision`, P, { allow: true, scope: 'assist' });
  ok('assist scope reported', r.j.scope === 'assist');
  ok('assist grantee can highlight', (await call('POST', `/debug/${r.j.id}/highlight`, Q, { line: 3 })).j?.ok === true);
  ok('bad line rejected', (await call('POST', `/debug/${r.j.id}/highlight`, Q, { line: -1 })).s === 400);
  // leaving ends access: open the owner's SSE, close it, wait for the 20 s grace
  const ac = new AbortController();
  await fetch(B + '/debug/events?room=r', { headers: P, signal: ac.signal }).catch(() => {});
  ac.abort();
  await new Promise((res) => setTimeout(res, 22000));
  ok('owner leaving revokes the grant', (await call('GET', '/debug/grants', Q)).j.find((g) => g.id === r.j.id)?.status === 'revoked');
  await call('POST', '/demo/reset', S, { roomCode: 'r' });
  ok('reset clears events', (await call('GET', '/progress/me?room=r', S)).j.runs === 0);
  r = await call('GET', '/progress/me?room=r', S);
  ok('summary has suggestions, definitions, trend', Array.isArray(r.j.suggestions) && r.j.conceptDefs.every((c) => c.definition) && Array.isArray(r.j.trend));
  ok('students cannot broadcast', (await call('POST', '/broadcast', S, { roomCode: 'r', message: 'hi' })).s === 403);
  ok('mentor broadcast validates input', (await call('POST', '/broadcast', M, { roomCode: 'r', message: '' })).s === 400);
} finally { srv.kill(); spawn('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { shell: true }); }
console.log(fails ? 'FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
