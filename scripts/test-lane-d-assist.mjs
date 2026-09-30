// Lane D checks for the assist features (suggested edits + re-run) and the diff helper. Starts its own server on :4407.
//   node --import tsx scripts/test-lane-d-assist.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { lineDiff, collapseDiff, changed } from '../web/src/debug/diff.ts';

const PORT = 4407;
const B = `http://localhost:${PORT}/api`;
const srv = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
  cwd: path.resolve('server'),
  env: { ...process.env, PORT: String(PORT), RUNNER: 'local', RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000' },
  stdio: 'ignore',
});
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = (id, name, role) => ({ 'x-user-id': id, 'x-user-name': name, 'x-role': role, 'content-type': 'application/json' });
const S = H('as', 'Stu', 'student');
const M = H('am', 'Mia', 'mentor');
const T = H('at', 'Third', 'student');
const call = async (method, p, h, body) => {
  const r = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { s: r.status, j };
};

/** Opens the per-user SSE stream and records every named event. */
function listen(uid, name, role) {
  const ctl = new AbortController();
  const events = [];
  fetch(`${B}/debug/events?room=r&uid=${uid}&uname=${name}&urole=${role}`, { signal: ctl.signal })
    .then(async (res) => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1] ?? 'message';
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (data) events.push({ ev, data: JSON.parse(data) });
        }
      }
    })
    .catch(() => {});
  return { events, close: () => ctl.abort() };
}
const waitFor = async (pred, what, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return;
    await sleep(50);
  }
  throw new Error('timed out waiting for ' + what);
};

const CODE = 'def f(xs):\n    return xs[len(xs)]\n\n\nprint(f([1, 2, 3]))\n';
const FIXED = 'def f(xs):\n    return xs[len(xs) - 1]\n\n\nprint(f([1, 2, 3]))\n';

try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(B + '/health')).ok) break;
    } catch {}
    await sleep(250);
  }
  const sOwner = listen('as', 'Stu', 'student');
  const sMentor = listen('am', 'Mia', 'mentor');
  await sleep(400);

  // ---- permissions -------------------------------------------------------------------------------------------------
  let gView;
  await check('a VIEW-ONLY grant cannot send suggestions (403)', async () => {
    const r = await call('POST', '/debug/request', M, { ownerId: 'as', roomCode: 'r' });
    gView = r.j.id;
    await call('POST', `/debug/${gView}/decision`, S, { allow: true }); // view only
    eq((await call('POST', `/debug/${gView}/proposal`, M, { source: FIXED, base: CODE })).s, 403, 'status');
    await call('POST', `/debug/${gView}/revoke`, S);
  });

  let g;
  await check('an ASSIST grant is created for the rest of the checks', async () => {
    const r = await call('POST', '/debug/request', M, { ownerId: 'as', roomCode: 'r' });
    g = r.j.id;
    const d = await call('POST', `/debug/${g}/decision`, S, { allow: true, scope: 'assist' });
    eq([d.j.status, d.j.scope], ['active', 'assist'], 'grant');
  });
  await check('nobody but the grantee can send: owner and a third user get 403', async () => {
    eq((await call('POST', `/debug/${g}/proposal`, S, { source: FIXED, base: CODE })).s, 403, 'owner');
    eq((await call('POST', `/debug/${g}/proposal`, T, { source: FIXED, base: CODE })).s, 403, 'third user');
  });
  await check('bad suggestions are refused: missing, blank, identical to the base, too long', async () => {
    eq((await call('POST', `/debug/${g}/proposal`, M, {})).s, 400, 'missing');
    eq((await call('POST', `/debug/${g}/proposal`, M, { source: '  \n', base: CODE })).s, 400, 'blank');
    eq((await call('POST', `/debug/${g}/proposal`, M, { source: CODE, base: CODE })).s, 400, 'identical');
    eq((await call('POST', `/debug/${g}/proposal`, M, { source: 'x'.repeat(30001), base: CODE })).s, 400, 'too long');
  });

  // ---- the suggestion life cycle -----------------------------------------------------------------------------------
  let p1;
  await check('a valid suggestion reaches ONLY the owner, live (SSE "proposal" with the text), and is listed for the owner only', async () => {
    const r = await call('POST', `/debug/${g}/proposal`, M, { source: FIXED, base: CODE, note: '  off by one  ' });
    eq(r.s, 200, 'status');
    p1 = r.j.id;
    await waitFor(() => sOwner.events.some((e) => e.ev === 'proposal'), 'owner event');
    const ev = sOwner.events.find((e) => e.ev === 'proposal').data;
    eq([ev.id, ev.by, ev.note, ev.source, ev.base], [p1, 'Mia', 'off by one', FIXED, CODE], 'event data');
    if (sMentor.events.some((e) => e.ev === 'proposal')) throw new Error('the helper should not receive its own proposal event');
    eq((await call('GET', '/debug/proposals', S)).j.map((p) => p.id), [p1], 'owner list');
    eq((await call('GET', '/debug/proposals', T)).j, [], 'third user list');
    eq((await call('GET', '/debug/proposals', M)).j, [], 'helper list');
  });
  await check('an immediate second suggestion is rate limited (429)', async () => {
    eq((await call('POST', `/debug/${g}/proposal`, M, { source: FIXED + '# again\n', base: CODE })).s, 429, 'status');
  });
  await check('only the owner may decide: helper and third user get 403; unknown id 404', async () => {
    eq((await call('POST', `/debug/${g}/proposal/${p1}/decision`, M, { accepted: true })).s, 403, 'helper');
    eq((await call('POST', `/debug/${g}/proposal/${p1}/decision`, T, { accepted: true })).s, 403, 'third');
    eq((await call('POST', `/debug/${g}/proposal/nope/decision`, S, { accepted: true })).s, 404, 'unknown');
    eq((await call('POST', `/debug/other-grant/proposal/${p1}/decision`, S, { accepted: true })).s, 404, 'wrong grant');
  });
  let p2;
  await check('a newer suggestion REPLACES the pending one (old one is withdrawn live)', async () => {
    await sleep(2100);
    const r = await call('POST', `/debug/${g}/proposal`, M, { source: FIXED + '# v2\n', base: CODE });
    eq(r.s, 200, 'status');
    p2 = r.j.id;
    await waitFor(() => sOwner.events.some((e) => e.ev === 'proposal-withdrawn' && e.data.id === p1), 'withdrawn event');
    eq((await call('GET', '/debug/proposals', S)).j.map((p) => p.id), [p2], 'only the new one is pending');
    eq((await call('POST', `/debug/${g}/proposal/${p1}/decision`, S, { accepted: true })).s, 409, 'old one can no longer be decided');
  });
  await check('ACCEPT: the helper is told live; it cannot be decided twice; nothing is pending any more', async () => {
    eq((await call('POST', `/debug/${g}/proposal/${p2}/decision`, S, { accepted: true })).s, 200, 'accept');
    await waitFor(() => sMentor.events.some((e) => e.ev === 'proposal-result'), 'result event');
    const ev = sMentor.events.find((e) => e.ev === 'proposal-result').data;
    eq([ev.id, ev.accepted, ev.by], [p2, true, 'Stu'], 'result event');
    eq((await call('POST', `/debug/${g}/proposal/${p2}/decision`, S, { accepted: false })).s, 409, 'second decision');
    eq((await call('GET', '/debug/proposals', S)).j, [], 'list');
  });
  await check('REJECT: the helper is told "accepted: false"', async () => {
    await sleep(2100);
    const r = await call('POST', `/debug/${g}/proposal`, M, { source: FIXED + '# v3\n', base: CODE });
    eq((await call('POST', `/debug/${g}/proposal/${r.j.id}/decision`, S, { accepted: false })).s, 200, 'reject');
    await waitFor(() => sMentor.events.filter((e) => e.ev === 'proposal-result').length >= 2, 'second result');
    eq(sMentor.events.filter((e) => e.ev === 'proposal-result').at(-1).data.accepted, false, 'accepted flag');
  });
  await check('REVOKING access withdraws a pending suggestion; afterwards no suggestions can be sent or decided', async () => {
    await sleep(2100);
    const r = await call('POST', `/debug/${g}/proposal`, M, { source: FIXED + '# v4\n', base: CODE });
    const before = sOwner.events.filter((e) => e.ev === 'proposal-withdrawn').length;
    await call('POST', `/debug/${g}/revoke`, S);
    await waitFor(() => sOwner.events.filter((e) => e.ev === 'proposal-withdrawn').length > before, 'withdrawn on revoke');
    eq((await call('POST', `/debug/${g}/proposal/${r.j.id}/decision`, S, { accepted: true })).s, 409, 'decide after revoke');
    eq((await call('POST', `/debug/${g}/proposal`, M, { source: FIXED + '# v5\n', base: CODE })).s, 403, 'send after revoke');
    eq((await call('GET', '/debug/proposals', S)).j, [], 'nothing pending');
  });

  // ---- re-run (uses Lane B's run routes: the new run belongs to the HELPER) -----------------------------------------------
  await check('RE-RUN: with assist access the helper reads the student\'s latest run, runs it again in their OWN console, and the student cannot read that run', async () => {
    const run = async (h, source, stdin = '') => {
      const r = await call('POST', '/run', h, { roomCode: 'r', language: 'python', source, stdin });
      eq(r.s, 202, 'POST /run');
      for (let i = 0; i < 80; i++) {
        await sleep(200);
        const x = await call('GET', '/run/' + r.j.id, h);
        if (x.j.status !== 'queued' && x.j.status !== 'running') return x.j;
      }
      throw new Error('run did not finish');
    };
    const studentRun = await run(S, 'name = input()\nprint(1 // 0)\n', 'Stu');
    eq(studentRun.status, 'runtime_error', 'student run');
    await sleep(300);
    const rq = await call('POST', '/debug/request', M, { ownerId: 'as', roomCode: 'r' });
    eq((await call('GET', '/runs/latest?ownerId=as', M)).s, 403, 'helper is blocked before access');
    await call('POST', `/debug/${rq.j.id}/decision`, S, { allow: true, scope: 'assist' });
    const seen = await call('GET', '/runs/latest?ownerId=as', M);
    eq([seen.s, seen.j.id], [200, studentRun.id], 'helper reads the latest run during access');
    const again = await run(M, seen.j.source, seen.j.stdin);
    eq([again.ownerId, again.status, again.errorLine], ['am', 'runtime_error', 2], 'the re-run belongs to the helper and fails on the same line');
    eq((await call('GET', '/run/' + again.id, S)).s, 403, 'the student cannot read the helper\'s re-run');
    eq((await call('GET', '/run/' + again.id, T)).s, 403, 'a third user cannot either');
    await call('POST', `/debug/${rq.j.id}/revoke`, S);
  });

  sOwner.close();
  sMentor.close();
} finally {
  await new Promise((resolve) => {
    srv.once('exit', resolve);
    srv.kill();
  });
}

// ---- the diff helper (pure) ---------------------------------------------------------------------------------------------------
const apply = (diff, keep) => diff.filter((d) => d.kind === 'same' || d.kind === keep).map((d) => d.text).join('\n');
await check('diff: one changed line -> same / del / add / same', () => {
  eq(lineDiff('a\nb\nc', 'a\nB\nc'), [{ kind: 'same', text: 'a' }, { kind: 'del', text: 'b' }, { kind: 'add', text: 'B' }, { kind: 'same', text: 'c' }], 'diff');
});
await check('diff: identical, empty, pure insertion, pure deletion, CRLF', () => {
  eq(lineDiff('x\ny', 'x\ny').every((d) => d.kind === 'same'), true, 'identical');
  eq(lineDiff('', 'a'), [{ kind: 'del', text: '' }, { kind: 'add', text: 'a' }], 'empty to a');
  eq(lineDiff('a\nc', 'a\nb\nc').map((d) => d.kind), ['same', 'add', 'same'], 'insertion');
  eq(lineDiff('a\nb\nc', 'a\nc').map((d) => d.kind), ['same', 'del', 'same'], 'deletion');
  eq(lineDiff('a\r\nb', 'a\nb').every((d) => d.kind === 'same'), true, 'CRLF vs LF');
  eq([changed('a\r\nb', 'a\nb'), changed('a', 'b')], [false, true], 'changed()');
});
await check('diff: PROPERTY - same+del rebuilds the old text and same+add rebuilds the new text (300 random edits)', () => {
  let seed = 12345;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const pool = ['a', 'b', 'c', 'd', 'e', '', 'print(x)', '    return y', 'for i in r:'];
  for (let k = 0; k < 300; k++) {
    const a = Array.from({ length: rnd(12) }, () => pool[rnd(pool.length)]);
    const b = a.slice();
    for (let e = rnd(4); e > 0; e--) {
      const op = rnd(3);
      if (op === 0) b.splice(rnd(b.length + 1), 0, pool[rnd(pool.length)]);
      else if (op === 1 && b.length) b.splice(rnd(b.length), 1);
      else if (b.length) b[rnd(b.length)] = pool[rnd(pool.length)];
    }
    const A = a.join('\n');
    const Bt = b.join('\n');
    const d = lineDiff(A, Bt);
    eq(apply(d, 'del'), A, `old text, case ${k}`);
    eq(apply(d, 'add'), Bt, `new text, case ${k}`);
  }
});
await check('diff: a huge rewrite (3000 vs 3000 different lines) falls back quickly and stays correct', () => {
  const A = Array.from({ length: 3000 }, (_, i) => 'old ' + i).join('\n');
  const Bt = Array.from({ length: 3000 }, (_, i) => 'new ' + i).join('\n');
  const t0 = Date.now();
  const d = lineDiff(A, Bt);
  if (Date.now() - t0 > 1500) throw new Error('too slow: ' + (Date.now() - t0) + ' ms');
  eq([apply(d, 'del') === A, apply(d, 'add') === Bt], [true, true], 'rebuild');
});
await check('diff: collapseDiff hides long unchanged stretches but keeps context around changes', () => {
  const a = Array.from({ length: 30 }, (_, i) => 'line ' + i).join('\n');
  const b = a.replace('line 15', 'CHANGED');
  const c = collapseDiff(lineDiff(a, b), 2);
  eq(c.filter((x) => x.kind === 'skip').map((x) => x.count), [13, 12], 'skipped runs');
  eq(c.filter((x) => x.kind !== 'skip').length, 6, 'visible lines (2 context + del + add + 2 context)');
  eq(collapseDiff(lineDiff('a', 'a'), 2), [{ kind: 'skip', count: 1 }], 'identical collapses to one skip');
});

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
