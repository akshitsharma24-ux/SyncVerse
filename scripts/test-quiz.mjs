// Quiz API checks: create, start, answer, judge, live leaderboard, end, permissions, persistence. Starts its own server (port 4420)
// with the local runner (Python), so it needs no internet and no keys.
//   node scripts/test-quiz.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.QUIZ_TEST_PORT ?? 4420);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-quiz-test-'));
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

let server;
function start(extraEnv = {}) {
  server = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: {
      ...process.env,
      PORT: String(PORT),
      RUNNER: 'local',
      COLLAB_DATA_DIR: dataDir,
      QUIZ_MIN_MINUTES: '0.03',
      QUIZ_SUBMIT_GAP_MS: '300',
      QUIZ_RUN_GAP_MS: '0',
      ...extraEnv,
    },
    stdio: 'ignore',
  });
}
async function up() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('server did not start');
}
async function stop() {
  if (!server) return;
  server.kill('SIGINT');
  await sleep(700);
  server.kill();
}

const ROOM = 'quiz-' + Math.random().toString(36).slice(2, 7);
const who = {
  teacher: { id: 'u-teacher', name: 'Ms Rao', role: 'mentor' },
  asha: { id: 'u-asha', name: 'Asha', role: 'student' },
  ravi: { id: 'u-ravi', name: 'Ravi', role: 'student' },
  meera: { id: 'u-meera', name: 'Meera', role: 'student' },
  vik: { id: 'u-vik', name: 'Vik', role: 'viewer' },
};
async function call(person, method, p, body, room = ROOM) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'x-user-id': person.id, 'x-user-name': person.name, 'x-role': person.role, 'x-room': room, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}
const snap = async (person) => (await call(person, 'GET', '/api/quiz')).json;
const join = (person) => call(person, 'POST', `/api/rooms/${ROOM}/join`, { role: person.role });

const CONFIG = { title: 'Arrays warm-up', topics: ['arrays', 'strings'], difficulty: 'easy', format: 'code', count: 2, minutes: 5, liveBoard: true };

start();
await up();
for (const p of Object.values(who)) await join(p); // the teacher joins first and so owns the room

await check('the catalog lists eight topics with question counts, and the runner languages', async () => {
  const r = await call(who.teacher, 'GET', '/api/quiz/catalog');
  eq(r.status, 200, 'status');
  eq(r.json.topics.length, 8, 'topics');
  const arrays = r.json.topics.find((t) => t.id === 'arrays');
  ok(arrays.counts.easy.mcq >= 2 && arrays.counts.hard.code >= 1, 'arrays has easy multiple choice and hard coding questions');
  const total = r.json.topics.reduce((n, t) => n + ['easy', 'medium', 'hard'].reduce((m, d) => m + t.counts[d].mcq + t.counts[d].code, 0), 0);
  eq(total, 88, 'questions in the bank (48 multiple choice + 40 coding)');
  ok(r.json.languages.includes('python'), 'python is offered');
});

await check('students and viewers cannot create a quiz; the teacher can', async () => {
  eq((await call(who.asha, 'POST', '/api/quiz/create', CONFIG)).status, 403, 'student create');
  eq((await call(who.vik, 'POST', '/api/quiz/create', CONFIG)).status, 403, 'viewer create');
  const r = await call(who.teacher, 'POST', '/api/quiz/create', CONFIG);
  eq(r.status, 200, 'teacher create: ' + r.text.slice(0, 120));
  eq(r.json.active.status, 'lobby', 'status');
  eq(r.json.active.questions.length, 2, 'the teacher sees the question list in the lobby');
});

await check('bad settings are refused with a message', async () => {
  await call(who.teacher, 'POST', '/api/quiz/cancel');
  for (const bad of [{ ...CONFIG, topics: [] }, { ...CONFIG, count: 99 }, { ...CONFIG, minutes: 0 }, { ...CONFIG, topics: ['nope'] }, { ...CONFIG, format: 'essay' }]) {
    const r = await call(who.teacher, 'POST', '/api/quiz/create', bad);
    eq(r.status, 400, 'status for ' + JSON.stringify(bad).slice(0, 60));
    ok(r.json.message, 'has a message');
  }
  eq((await call(who.teacher, 'POST', '/api/quiz/create', CONFIG)).status, 200, 'a good one still works');
});

await check('in the lobby students only learn the size of the quiz: no questions, no leaderboard', async () => {
  const s = await snap(who.asha);
  eq(s.active.status, 'lobby', 'status');
  eq(s.active.questions, [], 'questions hidden');
  eq(s.active.questionCount, 2, 'count');
  eq(s.active.leaderboard, null, 'leaderboard hidden');
  eq(s.active.reveal, undefined, 'no answers');
  eq(s.canAnswer, true, 'canAnswer');
  eq((await call(who.asha, 'POST', '/api/quiz/answer', { questionId: s.active.id, choice: 0 })).status, 409, 'cannot answer before the start');
});

await check('only a moderator can start; a second quiz cannot be created while one is open', async () => {
  eq((await call(who.asha, 'POST', '/api/quiz/start')).status, 403, 'student start');
  eq((await call(who.teacher, 'POST', '/api/quiz/create', CONFIG)).status, 409, 'create while open');
  eq((await call(who.teacher, 'POST', '/api/quiz/reroll')).status, 200, 'reroll in the lobby');
});

// An SSE listener that sees the start arrive
let streamed = null;
const controller = new AbortController();
const listen = (async () => {
  try {
    const res = await fetch(`${BASE}/api/quiz/stream`, { headers: { 'x-user-id': who.ravi.id, 'x-user-name': 'Ravi', 'x-role': 'student', 'x-room': ROOM }, signal: controller.signal });
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
        if (chunk.startsWith('data: ')) streamed = JSON.parse(chunk.slice(6));
      }
    }
  } catch {}
})();

await check('start: the clock runs and students get the questions (never the answers or hidden tests)', async () => {
  const r = await call(who.teacher, 'POST', '/api/quiz/start');
  eq(r.status, 200, 'start');
  const s = await snap(who.asha);
  eq(s.active.status, 'running', 'status');
  ok(s.active.endsAt - s.active.startedAt === 5 * 60_000, 'five minutes');
  eq(s.active.questions.length, 2, 'questions');
  eq(s.active.reveal, undefined, 'no reveal while running');
  const text = JSON.stringify(s);
  for (const secret of ['"answer"', '"explanation"', '"solution"', '"reference"', '"hidden"', 'import sys']) ok(!text.includes(secret), `the student view leaks ${secret}`);
  ok(s.active.questions.every((x) => x.type === 'code' && x.samples.length >= 1 && x.testCount > x.samples.length), 'code questions carry samples and a test count');
  const t = await snap(who.teacher);
  eq(t.active.reveal.length, 2, 'the teacher sees the model solutions');
  ok(t.active.leaderboard.length === 3, 'the leaderboard lists the three students');
});

await check('the live stream pushed the start to a connected student', async () => {
  for (let i = 0; i < 30 && !(streamed && streamed.active?.status === 'running'); i++) await sleep(100);
  ok(streamed?.active?.status === 'running', 'no running snapshot arrived on the stream');
});

await check('a student can try a program on a sample without scoring', async () => {
  const s = await snap(who.asha);
  const q = s.active.questions[0];
  const r = await call(who.asha, 'POST', '/api/quiz/run', { language: 'python', source: 'print(input())', stdin: 'hello\n' });
  eq(r.status, 200, 'status');
  eq(r.json.stdout.trim(), 'hello', 'stdout');
  eq((await snap(who.asha)).active.mine.score, 0, 'no points for a run');
  ok(q.samples[0].input, 'sample present');
});

let reference = [];
await check('a correct solution earns the full points for a coding question; the hidden tests all run', async () => {
  const t = await snap(who.teacher);
  reference = t.active.reveal.map((x) => x.solution);
  const q = t.active.questions[0];
  const r = await call(who.asha, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'python', source: reference[0] });
  eq(r.status, 200, 'submit: ' + r.text.slice(0, 200));
  eq(r.json.result.passed, r.json.result.total, 'all tests passed');
  ok(r.json.result.total === q.testCount, 'every test ran');
  eq(r.json.answer.points, q.points, 'points');
  for (const o of r.json.result.outcomes.filter((o) => o.index >= q.samples.length)) ok(o.input === undefined && o.expected === undefined, 'a hidden test leaked its input or output');
});

await check('a wrong answer earns partial or no credit and shows the failing sample, but not hidden tests', async () => {
  const t = await snap(who.teacher);
  const q = t.active.questions[0];
  const r = await call(who.ravi, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'python', source: 'print("0 0")' });
  eq(r.status, 200, 'submit');
  ok(r.json.result.passed < r.json.result.total, 'should not pass everything');
  const sample = r.json.result.outcomes.find((o) => o.index === 0);
  ok(sample.verdict !== 'passed' && sample.expected !== undefined, 'a failing sample shows what was expected');
  ok(r.json.answer.points < q.points, 'less than full points');
});

await check('a compile error is reported once with the message, and scores nothing', async () => {
  const t = await snap(who.teacher);
  const q = t.active.questions[0];
  const r = await call(who.meera, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'python', source: 'def broken(:\n  pass\n' });
  eq(r.status, 200, 'status');
  eq(r.json.answer.points, 0, 'points');
  ok(/Syntax/i.test(r.json.result.message ?? ''), 'message names the syntax error: ' + r.json.result.message);
  eq(r.json.result.outcomes.every((o) => o.verdict === 'compile_error'), true, 'every test is a compile error');
});

await check('only one submission is judged at a time per person, and a mentor or viewer cannot submit', async () => {
  const t = await snap(who.teacher);
  const q = t.active.questions[1];
  const send = () => call(who.asha, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'python', source: reference[1] });
  const both = await Promise.all([send(), send()]);
  eq(both.map((r) => r.status).sort(), [200, 429], 'one is judged, the other refused while it runs');
  eq((await call(who.teacher, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'python', source: 'print(1)' })).status, 403, 'mentor');
  eq((await call(who.vik, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'python', source: 'print(1)' })).status, 403, 'viewer');
});

await check('the leaderboard ranks by score and shows each question as solved, partial or not tried', async () => {
  const s = await snap(who.ravi);
  const rows = s.active.leaderboard;
  eq(rows[0].name, 'Asha', 'Asha leads');
  eq(rows[0].rank, 1, 'rank 1');
  ok(rows[0].score > rows[1].score, 'ahead of the next');
  eq(rows[0].cells.map((c) => c.state), ['full', 'full'], 'Asha solved both');
  const ravi = rows.find((r) => r.name === 'Ravi');
  ok(['partial', 'wrong'].includes(ravi.cells[0].state) && ravi.cells[1].state === 'none', 'Ravi: first question attempted, second not');
  eq(s.active.mine.rank, ravi.rank, 'his own rank (people on the same score share a rank)');
  const t = await snap(who.teacher);
  eq(t.active.stats.length, 2, 'the teacher gets per-question stats');
  eq(t.active.stats[0].full, 1, 'one person fully solved question 1');
  eq(t.active.stats[0].attempted, 3, 'three tried it');
});

await check('answers and the leaderboard are NOT revealed to students while the quiz runs (answers) but the live board is shared', async () => {
  const s = await snap(who.meera);
  eq(s.active.reveal, undefined, 'no answers');
  ok(Array.isArray(s.active.leaderboard), 'the live board is visible');
});

await check('ending the quiz freezes it: answers close, reveal and final board appear for everyone', async () => {
  eq((await call(who.asha, 'POST', '/api/quiz/end')).status, 403, 'a student cannot end it');
  eq((await call(who.teacher, 'POST', '/api/quiz/end')).status, 200, 'the teacher can');
  const s = await snap(who.meera);
  eq(s.active.status, 'ended', 'status');
  eq(s.active.reveal.length, 2, 'reveal');
  ok(s.active.reveal[0].solution.includes('def main'), 'model solution shown');
  ok(s.active.stats.length === 2 && s.active.leaderboard.length === 3, 'stats and the final board');
  const late = await call(who.ravi, 'POST', '/api/quiz/submit', { questionId: s.active.questions[1].id, language: 'python', source: reference[1] });
  eq(late.status, 409, 'answers are closed');
});

await check('a finished quiz stays on screen; the next quiz moves it to the history', async () => {
  const create = await call(who.teacher, 'POST', '/api/quiz/create', { ...CONFIG, format: 'mcq', count: 4, liveBoard: false });
  eq(create.status, 200, 'new quiz');
  const s = await snap(who.asha);
  eq(s.active.status, 'lobby', 'the new one is current');
  eq(s.past.length, 1, 'the old one is in the history');
  eq(s.past[0].status, 'ended', 'history entry is finished');
  ok(s.past[0].leaderboard.length === 3, 'with its final leaderboard');
});

let mcqIds = [];
await check('multiple choice: one try, instant feedback, wrong answers earn nothing, and a hidden live board stays hidden', async () => {
  await call(who.teacher, 'POST', '/api/quiz/start');
  const t = await snap(who.teacher);
  const qs = t.active.questions;
  mcqIds = qs.map((q) => q.id);
  eq(qs.every((q) => q.type === 'mcq' && q.options.length === 4), true, 'four options each');
  const right = (i) => t.active.reveal[i].answer;
  const ra = await call(who.asha, 'POST', '/api/quiz/answer', { questionId: qs[0].id, choice: right(0) });
  eq(ra.json.correct, true, 'correct answer');
  eq(ra.json.points, qs[0].points, 'points');
  const rb = await call(who.ravi, 'POST', '/api/quiz/answer', { questionId: qs[0].id, choice: (right(0) + 1) % 4 });
  eq(rb.json.correct, false, 'wrong answer');
  eq((await call(who.asha, 'POST', '/api/quiz/answer', { questionId: qs[0].id, choice: right(0) })).status, 409, 'second try refused');
  eq((await call(who.asha, 'POST', '/api/quiz/answer', { questionId: qs[1].id, choice: 9 })).status, 400, 'bad option');
  eq((await call(who.asha, 'POST', '/api/quiz/answer', { questionId: 'not-a-question', choice: 0 })).status, 404, 'unknown question');
  const s = await snap(who.asha);
  eq(s.active.leaderboard, null, 'students do not see the board while the mentor hides it');
  eq(s.active.mine.score, qs[0].points, 'but they see their own score');
  eq(s.active.mine.answers[qs[0].id].correct, true, 'and their own answers');
  ok((await snap(who.teacher)).active.leaderboard.length === 3, 'the mentor always sees the board');
  const mine = (await snap(who.ravi)).active.mine.answers[qs[0].id];
  eq(mine.correct, false, 'Ravi was told he was wrong');
  ok(mine.answer === undefined, 'but not the right option');
});

await check('a quiz ends by itself when the time is up (a 2-second quiz)', async () => {
  await call(who.teacher, 'POST', '/api/quiz/end');
  const create = await call(who.teacher, 'POST', '/api/quiz/create', { ...CONFIG, format: 'mcq', count: 2, minutes: 0.03, liveBoard: true });
  eq(create.status, 200, 'create: ' + create.text.slice(0, 120));
  await call(who.teacher, 'POST', '/api/quiz/start');
  eq((await snap(who.asha)).active.status, 'running', 'running at first');
  await sleep(2400);
  const s = await snap(who.asha);
  eq(s.active.status, 'ended', 'ended by the clock');
  ok(s.active.endedAt <= s.active.endsAt, 'recorded at the deadline');
});

await check('a quiz can be cancelled before it finishes; a finished one cannot', async () => {
  eq((await call(who.teacher, 'POST', '/api/quiz/cancel')).status, 409, 'the 2-second quiz is finished');
  const c = await call(who.teacher, 'POST', '/api/quiz/create', { ...CONFIG, format: 'mcq', count: 2 });
  eq(c.status, 200, 'create');
  eq((await call(who.teacher, 'POST', '/api/quiz/cancel')).status, 200, 'cancel');
  eq((await call(who.teacher, 'POST', '/api/quiz/cancel')).status, 404, 'nothing left to cancel');
});

await check('quizzes are private to their room', async () => {
  const s = await snap(who.asha);
  ok(s.active === null || s.active.status === 'ended', 'the cancelled one is gone (the last finished one may remain)');
  const stranger = { id: 'u-stranger', name: 'Zed', role: 'student' };
  const r = await call(stranger, 'GET', '/api/quiz');
  eq(r.status, 403, 'a non-member of a registered room is refused');
});

controller.abort();
await listen;

// ------------------------------------------------------------------------------------- persistence
await check('a running quiz survives a server restart, with its scores and its clock', async () => {
  await call(who.teacher, 'POST', '/api/quiz/create', { ...CONFIG, format: 'mcq', count: 2, minutes: 5 });
  await call(who.teacher, 'POST', '/api/quiz/start');
  const before = await snap(who.teacher);
  const q = before.active.questions[0];
  await call(who.asha, 'POST', '/api/quiz/answer', { questionId: q.id, choice: before.active.reveal[0].answer });
  const score = (await snap(who.asha)).active.mine.score;
  await sleep(900); // the quiz file is saved a moment after a change
  await stop();
  start();
  await up();
  const after = await snap(who.asha);
  eq(after.active.status, 'running', 'still running');
  eq(after.active.mine.score, score, 'score kept');
  eq(after.active.endsAt, before.active.endsAt, 'same deadline');
});

await stop();
fs.rmSync(dataDir, { recursive: true, force: true });
for (const [pass, name, detail] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
console.log(`\n${results.filter((r) => r[0]).length} of ${results.length} checks passed`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
