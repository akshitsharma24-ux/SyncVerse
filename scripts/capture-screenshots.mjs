// Takes the screenshots used in README.md and docs/features/ from the real app (docs/images/*.png). Starts its OWN servers (API :4470,
// web :5470) with the local runner and no AI key, so what is shown is the built-in behaviour and nothing needs internet.
//   npm run docs:screenshots
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const API = 4470;
const WEB = 5470;
const OUT = path.resolve('docs/images');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-shots-'));
const room = 'demo-' + Math.random().toString(36).slice(2, 6);
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, label, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pred()) return;
    await sleep(100);
  }
  throw new Error('timed out: ' + label);
}
const ok = (url) => fetch(url).then((r) => r.ok).catch(() => false);
const T = { timeout: 20000 };
const tid = (id) => `[data-testid="${id}"]`;

procs.push(
  spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(API), RUNNER: 'local', COLLAB_DATA_DIR: dir, LLM_API_KEY: '', RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000', QUIZ_SUBMIT_GAP_MS: '100' },
    stdio: 'ignore',
  }),
  spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--port', String(WEB), '--strictPort'], {
    cwd: path.resolve('web'),
    env: { ...process.env, SYNCVERSE_SERVER: `http://localhost:${API}` },
    stdio: 'ignore',
  }),
);
const stopAll = () => procs.forEach((p) => p.kill());
process.on('exit', stopAll);

const INDEX_ERROR = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';
const BEST_TIME = ['import sys', 'd = sys.stdin.read().split()', 'n = int(d[0])', 'p = list(map(int, d[1:1 + n]))', 'low = p[0]', 'best = 0', 'for x in p:', '    low = min(low, x)', '    best = max(best, x - low)', 'print(best)', ''].join('\n');
const TWO_SUM = 'import sys\nd = sys.stdin.read().split()\nn, t = int(d[0]), int(d[1])\na = list(map(int, d[2:2 + n]))\nseen = {}\nfor j, x in enumerate(a):\n    if t - x in seen:\n        print(seen[t - x], j)\n        break\n    seen[x] = j\n';

fs.mkdirSync(OUT, { recursive: true });
let browser;
try {
  await until(() => ok(`http://localhost:${API}/api/health`), 'api up');
  await until(() => ok(`http://localhost:${WEB}/`), 'web up', 60000);
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
  const BASE = `http://localhost:${WEB}`;
  const mk = async (name, role, roomName = room, viewport = { width: 1440, height: 900 }) => {
    const p = await (await browser.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
    await p.goto(`${BASE}/?name=${encodeURIComponent(name)}&role=${role}&room=${roomName}`);
    await p.waitForSelector('.monaco-editor', T);
    await p.waitForFunction(() => window.__sv?.files.list().length > 0, null, T);
    return p;
  };
  const snap = async (page, name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('saved', name);
  };

  // 1. the entry page
  {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto(BASE + '/');
    await p.waitForSelector(tid('hero-create'), T);
    await p.waitForTimeout(1500); // let the entry animation settle
    await snap(p, 'landing');
    await p.context().close();
  }

  // 2. the workspace: three people, a failed run explained by the AI tutor
  const rao = await mk('Ms Rao', 'mentor');
  const asha = await mk('Asha', 'student');
  const ravi = await mk('Ravi', 'student');
  await asha.evaluate((s) => window.__sv.editor.replaceAll(s), INDEX_ERROR);
  await asha.click(tid('run-btn'));
  await asha.waitForSelector(`${tid('run-status')}[data-status="runtime_error"]`, { timeout: 30000 });
  await asha.waitForSelector(tid('ai-explain-button'), T);
  await asha.click(tid('ai-explain-button'));
  await asha.waitForSelector(tid('ai-explanation'), T);
  await snap(asha, 'workspace');

  // 3. the hint ladder at its last rung
  await asha.evaluate((s) => window.__sv.editor.replaceAll(s), INDEX_ERROR);
  await asha.click(tid('run-btn'));
  await asha.waitForSelector(tid('ai-hint-start'), T);
  await asha.click(tid('ai-hint-start'));
  await asha.waitForSelector(tid('ai-hint-next'), T);
  await asha.click(tid('ai-hint-next'));
  await asha.click(tid('ai-hint-fix'));
  await asha.waitForSelector(tid('ai-hint-patch-button'), T);
  await snap(asha, 'hint-ladder');

  // 4. the step-through debugger, in the middle of the loop (a fresh page: no leftover error highlight from an earlier run)
  const dbg = await mk('Asha', 'student', room + '-debug');
  await dbg.click(tid('debug-btn'));
  await dbg.waitForSelector(tid('dbg-own'), T);
  for (let k = 0; k < 3; k++) {
    await dbg.click(tid('dbg-line-4'));
    await dbg.waitForFunction(() => document.querySelector('[data-testid="dbg-own"]')?.dataset.line === '4', null, T);
  }
  await snap(dbg, 'debugger');

  // 5. the quiz: the mentor's form, a student solving a coding problem, and the final board
  await openTool(rao, 'Quiz');
  await rao.waitForSelector(tid('quiz-topic-arrays'), T);
  await snap(rao, 'quiz-create');

  const quizRoom = room + '-quiz';
  const teacher = await mk('Ms Rao', 'mentor', quizRoom);
  const asha2 = await mk('Asha', 'student', quizRoom);
  await openTool(teacher, 'Quiz');
  await teacher.click(tid('quiz-topic-strings'));
  await teacher.click(tid('quiz-level-easy'));
  await teacher.click(tid('quiz-format-code'));
  for (let i = 0; i < 3; i++) await teacher.getByRole('button', { name: 'Fewer questions' }).click();
  await teacher.fill(tid('quiz-title-input'), 'Arrays sprint');
  await teacher.click(tid('quiz-create'));
  await teacher.waitForSelector(tid('quiz-start'), T);
  await teacher.click(tid('quiz-start'));
  await asha2.waitForSelector(tid('quiz-chip'), T);
  await asha2.click(tid('quiz-chip'));
  await asha2.waitForSelector(tid('quiz-code-question'), T);
  const title = (await asha2.textContent('.qz-statement h3')).trim();
  const solution = { 'Two Sum': TWO_SUM, 'Best Time to Buy and Sell Stock': BEST_TIME }[title];
  if (solution) {
    await asha2.waitForFunction(() => window.__svQuizCode, null, T);
    await asha2.evaluate((s) => window.__svQuizCode.setValue(s), solution);
    await asha2.click(tid('quiz-submit'));
    await asha2.waitForFunction(() => { const r = document.querySelector('[data-testid=quiz-result]'); return r && r.dataset.passed === r.dataset.total; }, null, { timeout: 60000 });
  }
  await snap(asha2, 'quiz-arena');
  await teacher.close();

  // a finished multi-student quiz for the board: made through the API, shown in the browser
  const boardRoom = room + '-board';
  const call = async (who, method, p, body) => {
    const r = await fetch(`http://localhost:${API}${p}`, { method, headers: { 'x-user-id': 'u-' + who.name, 'x-user-name': who.name, 'x-role': who.role, 'x-room': boardRoom, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => null);
  };
  const T0 = { name: 'Ms Rao', role: 'mentor' };
  const names = ['Asha', 'Ravi', 'Meera', 'Dev', 'Kabir', 'Ira'].map((name) => ({ name, role: 'student' }));
  await call(T0, 'POST', `/api/rooms/${boardRoom}/join`, { role: 'mentor' });
  for (const s of names) await call(s, 'POST', `/api/rooms/${boardRoom}/join`, { role: 'student' });
  await call(T0, 'POST', '/api/quiz/create', { title: 'Midterm DSA quiz', topics: ['arrays', 'stacks', 'dp'], difficulty: 'mixed', format: 'mcq', count: 6, minutes: 20, liveBoard: true });
  await call(T0, 'POST', '/api/quiz/start');
  const state = await call(T0, 'GET', '/api/quiz');
  const plan = [6, 5, 5, 3, 2, 0];
  for (const [i, s] of names.entries()) {
    for (let k = 0; k < plan[i]; k++) await call(s, 'POST', '/api/quiz/answer', { questionId: state.active.questions[k].id, choice: state.active.reveal[k].answer });
    await sleep(150);
  }
  await call(T0, 'POST', '/api/quiz/end');
  const viewer = await mk('Ms Rao', 'mentor', boardRoom);
  await openTool(viewer, 'Quiz');
  await viewer.waitForSelector(tid('quiz-open-board'), T);
  await viewer.click(tid('quiz-open-board'));
  await viewer.waitForSelector(tid('podium'), T);
  await snap(viewer, 'quiz-board');
  await ravi.close();
} finally {
  await browser?.close();
  stopAll();
  fs.rmSync(dir, { recursive: true, force: true });
}
