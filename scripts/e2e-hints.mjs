// The optional hint ladder in the Understand tool, in a real browser: "Explain with AI" and "Suggest a patch" still work on their own,
// and "Guide me with hints" is a separate path (a nudge, then a guiding question, then the fix). Starts its OWN servers (API :4440,
// web :5440) with no AI key and the local runner, so the built-in answers and the rule-based hints are what is tested.
//   npm run e2e:hints
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const API = 4440;
const WEB = 5440;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-e2e-hints-'));
const room = 'hints-' + Math.random().toString(36).slice(2, 7);
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
const T = { timeout: 20000 };
const tid = (id) => `[data-testid="${id}"]`;

procs.push(
  spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    // LLM_API_KEY is set (empty) so the .env value is not loaded: no AI provider, only built-in answers and rules
    env: { ...process.env, PORT: String(API), RUNNER: 'local', COLLAB_DATA_DIR: dir, LLM_API_KEY: '', RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000' },
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

const errors = [];
const a11y = [];
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
};
let browser;
try {
  await until(() => ok(`http://localhost:${API}/api/health`), 'api up');
  await until(() => ok(`http://localhost:${WEB}/`), 'web up', 40000);
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
  const mk = async (name, viewport = { width: 1440, height: 900 }) => {
    const p = await (await browser.newContext({ viewport })).newPage();
    p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource|WebSocket|ERR_/.test(m.text()) && errors.push(`[${name}] ${m.text()}`));
    await p.goto(`http://localhost:${WEB}/?name=${name}&role=student&room=${room}-${name.toLowerCase()}`);
    await p.waitForSelector('.monaco-editor', T);
    await p.waitForFunction(() => window.__sv?.files.list().length > 0, null, T);
    return p;
  };
  const audit = async (page, label) => {
    await page.waitForTimeout(350);
    await page.addScriptTag({ path: axePath });
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, exclude: [['.monaco-editor']] }));
    for (const v of res.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) a11y.push(`${label}: ${v.id} x${v.nodes.length} (${v.nodes[0].target.join(' ')})`);
  };
  /** Put a program in the shared editor, run it and wait for the failure to reach the Understand tool. */
  const failWith = async (p, source) => {
    await p.evaluate((s) => window.__sv.editor.replaceAll(s), source);
    await p.waitForSelector(tid('run-btn'), T);
    const before = (await p.getAttribute(tid('run-status'), 'data-run-id').catch(() => null)) ?? '';
    await p.click(tid('run-btn'));
    await p.waitForFunction(({ sel, before }) => {
      const el = document.querySelector(sel);
      return el && el.dataset.runId && el.dataset.runId !== before && el.dataset.status === 'runtime_error';
    }, { sel: tid('run-status'), before }, { timeout: 30000 });
    await p.waitForSelector(tid('ai-explain-button'), T);
  };
  const bodyText = (p) => p.evaluate(() => document.querySelector('[data-testid="ai-panel"]')?.textContent ?? '');

  const A = await mk('Asha');
  const INDEX_ERROR = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';

  await check('after a failed run the Understand tool offers all three: Explain, Suggest a patch, and the optional hints', async () => {
    await failWith(A, INDEX_ERROR);
    await A.waitForSelector(tid('ai-suggest-patch-button'), T);
    await A.waitForSelector(tid('ai-hint-start'), T);
    if (await A.locator(tid('ai-hint-ladder')).count()) throw new Error('the ladder must not open by itself');
    await shot(A, 'hints-01-choices');
    await audit(A, 'the three choices');
  });

  await check('the direct path is unchanged: Explain with AI shows the full explanation and the fix at once, no hints needed', async () => {
    await A.click(tid('ai-explain-button'));
    await A.waitForSelector(tid('ai-explanation'), T);
    const text = await A.textContent(tid('ai-explanation'));
    if (!/Try this/.test(text) || !/range\(len\(nums\)\)/.test(text)) throw new Error('explanation lacks the fix: ' + text.slice(0, 120));
    if (await A.locator(tid('ai-hint-ladder')).count()) throw new Error('hints should not appear on the direct path');
  });

  await check('Suggest a patch works on its own too, without climbing any ladder: preview, reject, nothing changes', async () => {
    const before = await A.evaluate(() => window.__sv.editor.getValue());
    await A.click(tid('ai-suggest-patch-button'));
    await A.waitForSelector(tid('ai-patch-modal'), T);
    await A.click(tid('patch-reject'));
    await A.waitForSelector(tid('ai-patch-modal'), { state: 'detached', ...T });
    if ((await A.evaluate(() => window.__sv.editor.getValue())) !== before) throw new Error('the editor changed after Reject');
  });

  await check('Guide me with hints: rung 1 shows only a nudge; the question and the fix stay hidden', async () => {
    await failWith(A, INDEX_ERROR); // a new run starts fresh (and leaves the earlier explanation behind)
    await A.click(tid('ai-hint-start'));
    await A.waitForSelector(tid('ai-hint-nudge'), T);
    const nudge = await A.textContent(tid('ai-hint-nudge'));
    if (!/position|past|index/i.test(nudge)) throw new Error('the nudge does not explain the idea: ' + nudge);
    for (const hidden of ['ai-hint-question', 'ai-explanation', 'ai-hint-fix', 'ai-explain-button', 'ai-suggest-patch-button']) {
      if (await A.locator(tid(hidden)).count()) throw new Error(`${hidden} should be hidden on rung 1`);
    }
    if (/range\(len\(nums\)\):/.test(await bodyText(A))) throw new Error('the fix leaked into rung 1');
    await A.waitForSelector(tid('ai-hint-next'), T);
    await shot(A, 'hints-02-nudge');
    await audit(A, 'hint ladder, rung 1');
  });

  await check('"Need another hint?" reveals the guiding question (with the code in it), still no fix', async () => {
    await A.click(tid('ai-hint-next'));
    await A.waitForSelector(tid('ai-hint-question'), T);
    const q = await A.textContent(tid('ai-hint-question'));
    if (!/range\(len\(nums\) \+ 1\)/.test(q) || !/\?/.test(q)) throw new Error('the question: ' + q);
    if (await A.locator(tid('ai-explanation')).count()) throw new Error('the explanation must stay hidden on rung 2');
    const focused = await A.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (focused !== 'ai-hint-question') throw new Error('focus did not move to the new hint: ' + focused);
    await A.waitForSelector(tid('ai-hint-fix'), T);
    await audit(A, 'hint ladder, rung 2');
  });

  await check('"Still stuck? Show the fix" opens rung 3: the full explanation, and now a patch button on the ladder', async () => {
    await A.click(tid('ai-hint-fix'));
    await A.waitForSelector(tid('ai-explanation'), T);
    const text = await A.textContent(tid('ai-explanation'));
    if (!/range\(len\(nums\)\)/.test(text)) throw new Error('rung 3 lacks the fix');
    await A.waitForSelector(tid('ai-hint-patch-button'), T);
    await shot(A, 'hints-03-fix');
    await audit(A, 'hint ladder, rung 3');
  });

  await check('the ladder\'s patch button opens the same reviewed preview; accepting it fixes the shared code for everyone', async () => {
    await A.click(tid('ai-hint-patch-button'));
    await A.waitForSelector(tid('ai-patch-modal'), T);
    await A.click(tid('patch-accept'));
    await A.waitForSelector(tid('ai-patch-modal'), { state: 'detached', ...T });
    const code = await A.evaluate(() => window.__sv.editor.getValue());
    if (!/range\(len\(nums\)\):/.test(code) || /len\(nums\) \+ 1/.test(code)) throw new Error('the patch was not applied');
  });

  await check('"Skip the hints and explain it directly" leaves the ladder and shows the explanation', async () => {
    await failWith(A, INDEX_ERROR);
    await A.click(tid('ai-hint-start'));
    await A.waitForSelector(tid('ai-hint-nudge'), T);
    await A.click(tid('ai-hint-skip'));
    await A.waitForSelector(tid('ai-explanation'), T);
    if (await A.locator(tid('ai-hint-ladder')).count()) throw new Error('the ladder is still open');
    await A.waitForSelector(tid('ai-explain-button'), T);
  });

  await check('"Leave the ladder" brings the normal buttons back, and a new run closes the ladder by itself', async () => {
    await failWith(A, INDEX_ERROR);
    await A.click(tid('ai-hint-start'));
    await A.waitForSelector(tid('ai-hint-ladder'), T);
    await A.click(tid('ai-hint-exit'));
    await A.waitForSelector(tid('ai-explain-button'), T);
    await A.click(tid('ai-hint-start'));
    await A.waitForSelector(tid('ai-hint-ladder'), T);
    await failWith(A, INDEX_ERROR.replace('print(average([3, 4, 5]))', 'print(average([1, 2]))')); // a new failing run
    if (await A.locator(tid('ai-hint-ladder')).count()) throw new Error('a new run should start fresh');
  });

  await check('with no AI at all, hints still work from the error message (a KeyError), and rung 3 explains why the fix is missing', async () => {
    await failWith(A, 'prices = {"apple": 3}\nprint(prices["pear"])\n');
    await A.click(tid('ai-hint-start'));
    await A.waitForSelector(tid('ai-hint-nudge'), T);
    const nudge = await A.textContent(tid('ai-hint-nudge'));
    if (!/dictionary|map|key/i.test(nudge)) throw new Error('the nudge: ' + nudge);
    if (!/General hints/.test(await bodyText(A))) throw new Error('the source of the hints is not stated');
    await A.click(tid('ai-hint-next'));
    const q = await A.textContent(tid('ai-hint-question'));
    if (!/line 2/.test(q) || !/\?/.test(q)) throw new Error('the question should point at line 2: ' + q);
    await A.click(tid('ai-hint-fix'));
    await A.waitForSelector(tid('ai-explain-error'), T); // no AI key: the fix cannot be generated, and the ladder says so
    await A.waitForSelector(tid('ai-hint-fix-retry'), T);
    if (!(await A.locator(tid('ai-hint-ladder')).isVisible())) throw new Error('the ladder should stay usable');
  });

  await check('the Progress page notes the hints as an observation, never a score', async () => {
    const picker = A.locator('select[aria-label="Learning tool"]');
    await picker.selectOption({ label: 'Your progress' });
    await A.waitForFunction(() => /step-by-step hints/.test(document.querySelector('[data-testid=observations]')?.textContent ?? ''), null, T);
    await picker.selectOption({ label: 'Understand' });
  });

  await check('a student can start the ladder on a phone: the panel fits and the ladder works', async () => {
    const phone = await mk('Meera', { width: 390, height: 800 });
    await phone.evaluate((s) => window.__sv.editor.replaceAll(s), INDEX_ERROR);
    await phone.click(tid('run-btn'));
    await phone.waitForSelector(`${tid('run-status')}[data-status="runtime_error"]`, { timeout: 30000 });
    await phone.waitForSelector(tid('ai-hint-start'), T);
    await phone.click(tid('ai-hint-start'));
    await phone.waitForSelector(tid('ai-hint-nudge'), T);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error('the page overflows by ' + overflow);
    await phone.context().close();
  });

  await check('no serious accessibility violations on the new screens (axe-core, WCAG 2.1 AA)', async () => {
    if (a11y.length) throw new Error(a11y.slice(0, 3).join(' | '));
  });
  await check('no script errors', async () => {
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
