// The quiz in real browsers: a mentor creates a quiz, three students answer (coding and multiple choice), the live leaderboard updates
// for everyone, the mentor ends it, and the final board, podium and CSV appear. Starts its OWN servers (API :4430, web :5430) with the
// local runner, so it needs no internet and does not touch npm run dev.
//   npm run e2e:quiz              (E2E_SHOTS=<folder> also saves screenshots)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const API = 4430;
const WEB = 5430;
const SHOTS = process.env.E2E_SHOTS;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-e2e-quiz-'));
const room = 'quiz-' + Math.random().toString(36).slice(2, 7);
const procs = [];
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, label, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pred()) return;
    await sleep(100);
  }
  throw new Error('timed out: ' + label);
}
const ok = (url) => fetch(url).then((r) => r.ok).catch(() => false);
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const T = { timeout: 20000 };

procs.push(
  spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(API), RUNNER: 'local', COLLAB_DATA_DIR: dir, QUIZ_SUBMIT_GAP_MS: '200', QUIZ_RUN_GAP_MS: '0' },
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

const SOLUTIONS = {
  'Two Sum': `import sys
d = sys.stdin.read().split()
n, t = int(d[0]), int(d[1])
a = list(map(int, d[2:2 + n]))
seen = {}
for j, x in enumerate(a):
    if t - x in seen:
        print(seen[t - x], j)
        break
    seen[x] = j
`,
  'Best Time to Buy and Sell Stock': `import sys
d = sys.stdin.read().split()
n = int(d[0])
p = list(map(int, d[1:1 + n]))
lo = p[0]
best = 0
for x in p:
    lo = min(lo, x)
    best = max(best, x - lo)
print(best)
`,
};

let browser;
const errors = [];
const a11y = []; // serious or critical accessibility findings, reported by one check at the end
/** axe-core (WCAG 2.0/2.1 A and AA) on whatever is on screen; serious or critical findings fail the check. Monaco's own insides are skipped. */
async function audit(page, label) {
  await page.waitForTimeout(400); // let colour transitions finish: axe reads the colours as they are at that instant
  await page.addScriptTag({ path: axePath });
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, exclude: [['.monaco-editor']] }));
  const hard = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  for (const v of hard) a11y.push(`${label}: ${v.id} x${v.nodes.length} (${v.nodes[0].target.join(' ')}: ${(v.nodes[0].any[0]?.message ?? '').slice(0, 130)})`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

try {
  await until(() => ok(`http://localhost:${API}/api/health`), 'api up');
  await until(() => ok(`http://localhost:${WEB}/`), 'web up', 40000);
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
  const BASE = `http://localhost:${WEB}`;
  const mk = async (name, role, viewport = { width: 1440, height: 900 }) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource|WebSocket|ERR_/.test(m.text()) && errors.push(`[${name}] ${m.text()}`));
    await p.goto(`${BASE}/?name=${encodeURIComponent(name)}&role=${role}&room=${room}`);
    await p.waitForSelector('[data-testid=topbar]', T);
    await p.waitForSelector('.monaco-editor', T);
    return p;
  };
  const teacher = await mk('Ms Rao', 'mentor');
  const asha = await mk('Asha', 'student');
  const ravi = await mk('Ravi', 'student');
  const vik = await mk('Vik', 'viewer');

  // -------------------------------------------------------------------------- create
  await check('the Quiz tool is in the learning tools and opens an empty state for students', async () => {
    await openTool(asha, 'Quiz');
    await asha.waitForSelector('[data-testid=quiz-none]', T);
    await openTool(teacher, 'Quiz');
    await teacher.waitForSelector('[data-testid=quiz-form]', T);
  });

  await check('the mentor answers five short questions and creates a quiz (topics, level, type, count, time)', async () => {
    await teacher.waitForSelector('[data-testid=quiz-topic-arrays]', T);
    await shot(teacher, '01-create-form');
    await audit(teacher, 'the create form');
    await teacher.click('[data-testid=quiz-topic-strings]'); // arrays only (strings was on by default)
    await teacher.click('[data-testid=quiz-level-easy]');
    await teacher.click('[data-testid=quiz-format-code]');
    for (let i = 0; i < 3; i++) await teacher.getByRole('button', { name: 'Fewer questions' }).click();
    eq(await teacher.textContent('[data-testid=quiz-count]'), '2', 'count');
    await teacher.fill('[data-testid=quiz-minutes]', '10');
    await teacher.fill('[data-testid=quiz-title-input]', 'Arrays sprint');
    await teacher.waitForFunction(() => /questions match/.test(document.querySelector('[data-testid=quiz-available]')?.textContent ?? ''), null, T);
    await teacher.click('[data-testid=quiz-create]');
    await teacher.waitForSelector('[data-testid=quiz-question-list]', T);
    eq(await teacher.locator('[data-testid=quiz-question-list] li').count(), 2, 'questions listed');
    const text = await teacher.textContent('[data-testid=quiz-summary]');
    if (!/Arrays sprint/.test(text) || !/Easy/.test(text) || !/Coding/.test(text) || !/10 min/.test(text)) throw new Error('summary does not show the choices: ' + text);
    await shot(teacher, '02-lobby-teacher');
    await audit(teacher, 'the mentor lobby');
  });

  await check('students wait in the lobby, told how many questions but not what they are', async () => {
    await asha.waitForSelector('[data-testid=quiz-wait]', T);
    const text = await asha.textContent('[data-testid=quiz-wait]');
    if (!/2 questions/.test(text)) throw new Error('lobby does not say how many questions: ' + text);
    await openTool(asha, 'Quiz');
    await shot(asha, '03-lobby-student');
  });

  // ---------------------------------------------------------------------------- run
  await check('start: students see Quiz live in the top bar and a toast', async () => {
    await teacher.click('[data-testid=quiz-start]');
    await asha.waitForSelector('[data-testid=quiz-chip]', T);
    const chip = await asha.textContent('[data-testid=quiz-chip]');
    if (!/Quiz live/.test(chip)) throw new Error('chip: ' + chip);
    await asha.waitForFunction(() => /Quiz started/.test(document.body.textContent ?? ''), null, T);
    await ravi.waitForSelector('[data-testid=quiz-chip]', T);
    await teacher.waitForSelector('[data-testid=quiz-open-board]', T);
  });

  const titleOf = (p) => p.textContent('.qz-statement h3');
  const solve = async (p, source) => {
    await p.waitForSelector('[data-testid=quiz-code]', T);
    await p.waitForFunction(() => window.__svQuizCode, null, T);
    await p.evaluate((s) => window.__svQuizCode.setValue(s), source);
    await p.click('[data-testid=quiz-submit]');
  };

  await check('Asha opens the quiz and solves both coding questions: every test passes', async () => {
    await asha.click('[data-testid=quiz-chip]');
    await asha.waitForSelector('[data-testid=quiz-arena]', T);
    await shot(asha, '04-arena-code');
    await audit(asha, 'the answering view (coding question)');
    for (let i = 0; i < 2; i++) {
      await asha.click(`[data-testid=quiz-q-${i + 1}]`);
      await asha.waitForSelector('[data-testid=quiz-code-question]', T);
      const title = (await titleOf(asha)).trim();
      if (!SOLUTIONS[title]) throw new Error('unexpected problem: ' + title);
      await solve(asha, SOLUTIONS[title]);
      await asha.waitForFunction(() => {
        const r = document.querySelector('[data-testid=quiz-result]');
        return r && r.dataset.passed === r.dataset.total && Number(r.dataset.total) > 3;
      }, null, { timeout: 60000 });
    }
    await shot(asha, '05-arena-solved');
    await asha.waitForFunction(() => /^20/.test(document.querySelector('[data-testid=quiz-score]')?.textContent ?? ''), null, T);
  });

  await check('Ravi runs his program on a sample, then submits a wrong answer and sees which sample failed (but no hidden test)', async () => {
    await ravi.click('[data-testid=quiz-chip]');
    await ravi.waitForSelector('[data-testid=quiz-code-question]', T);
    await ravi.waitForFunction(() => window.__svQuizCode, null, T);
    await ravi.evaluate(() => window.__svQuizCode.setValue('print(input())\n'));
    await ravi.click('[data-testid=quiz-run]');
    await ravi.waitForSelector('[data-testid=quiz-run-output]', T);
    const out = await ravi.textContent('[data-testid=quiz-run-output]');
    if (!/\d/.test(out)) throw new Error('no run output: ' + out);
    await ravi.evaluate(() => window.__svQuizCode.setValue('print("0 0")\n'));
    await ravi.click('[data-testid=quiz-submit]');
    await ravi.waitForSelector('[data-testid=quiz-result]', { timeout: 60000 });
    const r = await ravi.locator('[data-testid=quiz-result]').evaluate((el) => ({ passed: Number(el.dataset.passed), total: Number(el.dataset.total) }));
    if (!(r.passed < r.total)) throw new Error('a wrong answer passed everything');
    const text = await ravi.textContent('[data-testid=quiz-result]');
    if (!/Expected/.test(text) && r.passed > 0) throw new Error('no failing sample shown');
    await shot(ravi, '06-arena-wrong');
  });

  await check('a compile error shows the compiler message and counts nothing', async () => {
    await ravi.click('[data-testid=quiz-q-2]');
    await ravi.waitForSelector('[data-testid=quiz-code-question]', T);
    await ravi.waitForFunction(() => window.__svQuizCode, null, T);
    await ravi.evaluate(() => window.__svQuizCode.setValue('def broken(:\n'));
    await ravi.click('[data-testid=quiz-submit]');
    await ravi.waitForFunction(() => /Syntax/i.test(document.querySelector('[data-testid=quiz-result]')?.textContent ?? ''), null, { timeout: 60000 });
  });

  await check('the live leaderboard updates by itself: Asha leads, for the mentor and for students', async () => {
    await teacher.click('[data-testid=quiz-open-board]');
    await teacher.waitForSelector('[data-testid=quiz-board] [data-testid=leaderboard-row]', T);
    await teacher.waitForFunction(() => document.querySelector('[data-testid=quiz-board] tr[data-name=Asha]')?.dataset.rank === '1', null, T);
    const asRows = await teacher.locator('[data-testid=quiz-board] [data-testid=leaderboard-row]').evaluateAll((rows) => rows.map((r) => ({ name: r.dataset.name, score: Number(r.dataset.score) })));
    eq(asRows.find((r) => r.name === 'Asha').score, 20, 'Asha score');
    if (!asRows.some((r) => r.name === 'Ravi') || asRows.some((r) => r.name === 'Ms Rao')) throw new Error('the mentor should not be a row, students should: ' + JSON.stringify(asRows));
    await shot(teacher, '07-board-live');
    await audit(teacher, 'the live board');
    await asha.waitForFunction(() => document.querySelector('.qz-side [data-testid=leaderboard-row][data-name=Asha]')?.dataset.rank === '1', null, T);
    await teacher.keyboard.press('Escape');
    await teacher.waitForSelector('[data-testid=quiz-board]', { state: 'detached', ...T });
  });

  await check('the mentor sees how each question went, and who has started', async () => {
    await teacher.waitForSelector('[data-testid=quiz-stats]', T);
    const stats = await teacher.locator('[data-testid=quiz-stat]').evaluateAll((els) => els.map((e) => ({ full: Number(e.dataset.full), attempted: Number(e.dataset.attempted) })));
    eq(stats.length, 2, 'two questions');
    if (!stats.some((s) => s.full === 1) || !stats.every((s) => s.attempted >= 1)) throw new Error('stats: ' + JSON.stringify(stats));
    const line = await teacher.textContent('[data-testid=quiz-progress]');
    if (!/2 of \d+ students have started/.test(line)) throw new Error('progress line: ' + line);
    await shot(teacher, '08-teacher-running');
    await audit(teacher, 'the mentor panel while the quiz runs');
  });

  await check('a viewer follows the quiz but cannot answer', async () => {
    await openTool(vik, 'Quiz');
    await vik.waitForSelector('[data-testid=quiz-panel]', T);
    if (await vik.locator('[data-testid=quiz-open-arena]').count()) throw new Error('a viewer was offered the answering view');
    await vik.waitForFunction(() => /viewer/i.test(document.querySelector('[data-testid=quiz-panel]')?.textContent ?? ''), null, T);
  });

  await check('a student refreshing the page keeps the quiz, the score and the code they typed', async () => {
    await asha.reload();
    await asha.waitForSelector('[data-testid=quiz-chip]', T);
    await asha.click('[data-testid=quiz-chip]');
    await asha.waitForSelector('[data-testid=quiz-arena]', T);
    await asha.waitForFunction(() => /^20/.test(document.querySelector('[data-testid=quiz-score]')?.textContent ?? ''), null, T);
    await asha.click('[data-testid=quiz-q-1]');
    await asha.waitForFunction(() => window.__svQuizCode?.getValue().includes('import sys'), null, T);
    await asha.keyboard.press('Escape');
  });

  // ---------------------------------------------------------------------------- end
  await check('ending the quiz: everyone gets the final result, the right answers and the podium', async () => {
    await teacher.click('[data-testid=quiz-end]');
    await teacher.click('[data-testid=quiz-end-confirm]');
    await openTool(asha, 'Quiz');
    await asha.waitForSelector('[data-testid=quiz-final-mine]', T);
    const mine = await asha.textContent('[data-testid=quiz-final-mine]');
    if (!/20/.test(mine) || !/Rank 1/.test(mine)) throw new Error('final result: ' + mine);
    await asha.click('[data-testid=quiz-open-board]');
    await asha.waitForSelector('[data-testid=podium]', T);
    await shot(asha, '09-final-board');
    await audit(asha, 'the final board');
    await asha.keyboard.press('Escape');
    await asha.click('[data-testid=quiz-review]');
    await asha.waitForSelector('[data-testid=quiz-arena]', T);
    await asha.waitForFunction(() => /Model solution/.test(document.querySelector('[data-testid=quiz-arena]')?.textContent ?? ''), null, T);
    await shot(asha, '10-review');
    await asha.keyboard.press('Escape');
    await vik.waitForFunction(() => /Final leaderboard/.test(document.querySelector('[data-testid=quiz-panel]')?.textContent ?? ''), null, T);
  });

  await check('the mentor exports the final leaderboard as CSV', async () => {
    const [download] = await Promise.all([teacher.waitForEvent('download', T), teacher.click('[data-testid=quiz-export]')]);
    const text = fs.readFileSync(await download.path(), 'utf8');
    if (!/"Rank","Name","Score"/.test(text) || !/Asha/.test(text) || !/Ravi/.test(text)) throw new Error('csv: ' + text.slice(0, 200));
    await shot(teacher, '11-teacher-final');
  });

  // ---------------------------------------------------------------- multiple choice, hidden board
  await check('a second quiz: multiple choice with the live board hidden from students', async () => {
    await teacher.click('[data-testid=quiz-new]');
    await teacher.waitForSelector('[data-testid=quiz-form]', T);
    await teacher.click('[data-testid=quiz-level-mixed]');
    await teacher.click('[data-testid=quiz-format-mcq]');
    for (let i = 0; i < 2; i++) await teacher.getByRole('button', { name: 'Fewer questions' }).click(); // 3 questions
    await teacher.uncheck('[data-testid=quiz-liveboard]');
    await teacher.click('[data-testid=quiz-create]');
    await teacher.waitForSelector('[data-testid=quiz-start]', T);
    await teacher.click('[data-testid=quiz-start]');
    await asha.waitForSelector('[data-testid=quiz-chip]', T);
    await asha.click('[data-testid=quiz-chip]');
    await asha.waitForSelector('[data-testid=quiz-mcq]', T);
    await shot(asha, '12-arena-mcq');
    await audit(asha, 'the answering view (multiple choice)');
  });

  await check('answering: pick an option, lock it in, get feedback; one try only; no board for students', async () => {
    await asha.click('[data-testid=quiz-option-0]');
    await asha.click('[data-testid=quiz-lock]');
    await asha.waitForSelector('[data-testid=quiz-feedback]', T);
    const fb = await asha.textContent('[data-testid=quiz-feedback]');
    if (!/Correct|Not this time/.test(fb)) throw new Error('feedback: ' + fb);
    eq(await asha.locator('[data-testid=quiz-lock]').count(), 0, 'lock button is gone after answering');
    eq(await asha.locator('[data-testid=quiz-option-1]').isDisabled(), true, 'options are locked');
    const side = await asha.textContent('.qz-side');
    if (!/hidden/i.test(side)) throw new Error('students should be told the board is hidden: ' + side);
    await shot(asha, '13-mcq-answered');
    await audit(asha, 'a locked-in multiple choice answer');
  });

  await check('the mentor still sees the whole board, and a quiz can be ended again', async () => {
    await teacher.click('[data-testid=quiz-open-board]');
    await teacher.waitForSelector('[data-testid=quiz-board] [data-testid=leaderboard-row]', T);
    await teacher.keyboard.press('Escape');
    await teacher.click('[data-testid=quiz-end]');
    await teacher.click('[data-testid=quiz-end-confirm]');
    await teacher.waitForSelector('[data-testid=quiz-new]', T);
    await teacher.waitForFunction(() => document.querySelectorAll('.qz-history li').length >= 1, null, T);
  });

  // ------------------------------------------------------------------------------------- phone
  await check('on a phone the quiz fits the screen: no sideways scroll in the panel, the arena or the board', async () => {
    const phone = await mk('Meera', 'student', { width: 390, height: 800 });
    await openTool(phone, 'Quiz');
    await phone.waitForSelector('[data-testid=quiz-panel]', T);
    const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if ((await overflow(phone)) > 1) throw new Error('page overflows by ' + (await overflow(phone)));
    await phone.click('[data-testid=quiz-open-board]');
    await phone.waitForSelector('[data-testid=quiz-board]', T);
    if ((await overflow(phone)) > 1) throw new Error('board overflows by ' + (await overflow(phone)));
    await shot(phone, '14-phone-board');
    await phone.keyboard.press('Escape');
    await phone.click('[data-testid=quiz-review]');
    await phone.waitForSelector('[data-testid=quiz-arena]', T);
    if ((await overflow(phone)) > 1) throw new Error('arena overflows by ' + (await overflow(phone)));
    await shot(phone, '15-phone-arena');
    await phone.context().close();
  });

  await check('no serious accessibility violations on any quiz screen (axe-core, WCAG 2.1 AA)', async () => {
    if (a11y.length) throw new Error(a11y.slice(0, 4).join(' | '));
  });

  await check('no script errors in any browser', async () => {
    if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
  });
} finally {
  await browser?.close();
  stopAll();
  fs.rmSync(dir, { recursive: true, force: true });
}

for (const [pass, name, d] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
console.log(`\n${results.filter((r) => r[0]).length} of ${results.length} checks passed`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
