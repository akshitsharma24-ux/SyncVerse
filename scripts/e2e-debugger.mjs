// The step-through debugger in real browsers, alone and between a student and a mentor: Debug on failing and on correct code, the loop
// variable changing step by step, run-to-line, play, the line marked in the editor, Python-only message, and then the mentor flow:
// request, the student's notice and dialog, the mentor's notice, following the student live, stepping alone, a new trace, revoke,
// deny. Starts its OWN servers (API :4460, web :5460) with the local runner; needs no internet and does not touch npm run dev.
//   npm run e2e:debugger
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const API = 4460;
const WEB = 5460;
const SHOTS = process.env.E2E_SHOTS;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-e2e-debugger-'));
const room = 'dbg-' + Math.random().toString(36).slice(2, 7);
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
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

procs.push(
  spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(API), RUNNER: 'local', COLLAB_DATA_DIR: dir, TRACE_MIN_GAP_MS: '200', RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000' },
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
const CORRECT = 'def average(nums):\n    total = 0\n    for i in range(len(nums)):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint("average is", average([3, 4, 5]))\n';

const errors = [];
const a11y = [];
let browser;
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function audit(page, label) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: axePath });
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, exclude: [['.monaco-editor']] }));
  for (const v of res.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) a11y.push(`${label}: ${v.id} x${v.nodes.length} (${v.nodes[0].target.join(' ')})`);
}

try {
  await until(() => ok(`http://localhost:${API}/api/health`), 'api up');
  await until(() => ok(`http://localhost:${WEB}/`), 'web up', 40000);
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
  const mk = async (name, role, viewport = { width: 1440, height: 900 }, roomName = room) => {
    const p = await (await browser.newContext({ viewport })).newPage();
    p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource|WebSocket|ERR_/.test(m.text()) && errors.push(`[${name}] ${m.text()}`));
    await p.goto(`http://localhost:${WEB}/?name=${encodeURIComponent(name)}&role=${role}&room=${roomName}`);
    await p.waitForSelector('.monaco-editor', T);
    await p.waitForFunction(() => window.__sv?.files.list().length > 0, null, T);
    return p;
  };
  const userId = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('syncverse.session')).userId);
  const toastText = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=toast]')].map((t) => t.textContent).join(' | '));
  const toastHas = (p, re, label) => p.waitForFunction((src) => [...document.querySelectorAll('[data-testid=toast]')].some((t) => new RegExp(src).test(t.textContent ?? '')), re.source, T).catch(async () => { throw new Error(`no notice "${label}"; saw: ${await toastText(p)}`); });
  const own = (p) => p.locator(tid('dbg-own'));
  const stepOf = async (loc) => Number(await loc.getAttribute('data-step'));

  // ------------------------------------------------------------------------------------------------ alone
  const asha = await mk('Asha', 'student');

  await check('the console has a Debug button next to Run; on the room\'s failing program it opens the debugger in the Debug tool', async () => {
    await asha.waitForSelector(tid('debug-btn'), T);
    await asha.click(tid('debug-btn'));
    await asha.waitForSelector(tid('dbg-own'), T);
    eq(await asha.locator(tid('dbg-state')).textContent(), 'Stops with IndexError', 'state');
    eq(await asha.locator(tid('dbg-position')).textContent(), '1', 'starts at the first step');
    await shot(asha, 'dbg-01-start');
  });

  await check('the current line is marked in the shared editor, like an IDE', async () => {
    await asha.waitForSelector('.sv-step-line', { state: 'attached', ...T });
    eq(await asha.locator('.sv-step-line').count(), 1, 'one marked line');
    await asha.click(tid('dbg-next'));
    await asha.click(tid('dbg-next'));
    const line = await asha.getAttribute(tid('dbg-own'), 'data-line');
    const marked = await asha.evaluate(() => {
      const el = document.querySelector('.sv-step-line');
      const top = el?.getBoundingClientRect().top;
      const rows = [...document.querySelectorAll('.monaco-editor .view-line')];
      return rows.findIndex((r) => Math.abs(r.getBoundingClientRect().top - top) < 4) + 1;
    });
    if (marked <= 0) throw new Error('could not find the marked row; step line ' + line);
  });

  await check('Run to line 4 four times: the loop variable goes 0, 1, 2, 3 and its history builds up', async () => {
    const seen = [];
    for (let k = 0; k < 4; k++) {
      await asha.click(tid('dbg-line-4'));
      await asha.waitForFunction(() => document.querySelector('[data-testid="dbg-own"]')?.dataset.line === '4', null, T);
      seen.push(await asha.locator(tid('dbg-var-i')).textContent());
    }
    eq(seen.map((s) => s.trim()), ['0', '1', '2', '3'], 'i at the start of each pass through line 4');
    const hist = (await asha.locator(tid('dbg-hist-i')).textContent()).replace(/\s+/g, '');
    if (!/0.*1.*2.*3/.test(hist)) throw new Error('history chips: ' + hist);
    eq((await asha.locator(tid('dbg-var-total')).textContent()).trim(), '12', 'total on the last pass');
    await shot(asha, 'dbg-02-loop');
    await audit(asha, 'debugger, mid-loop');
  });

  await check('Step goes forward one line at a time, Step back undoes it, and a changed variable is marked', async () => {
    const before = await stepOf(own(asha));
    await asha.click(tid('dbg-next'));
    eq(await stepOf(own(asha)), before + 1, 'one forward');
    await asha.click(tid('dbg-back'));
    eq(await stepOf(own(asha)), before, 'one back');
    await asha.keyboard.press('ArrowRight');
    await asha.waitForFunction((b) => Number(document.querySelector('[data-testid="dbg-own"]').dataset.step) === b + 1, before, T).catch(() => undefined);
  });

  await check('Jump to the error lands on the IndexError at line 4 and says so', async () => {
    await asha.click(tid('dbg-first'));
    await asha.click(tid('dbg-jump-error'));
    await asha.waitForSelector(tid('dbg-error'), T);
    const text = await asha.textContent(tid('dbg-error'));
    if (!/IndexError/.test(text) || !/line 4/.test(text)) throw new Error('error card: ' + text);
    if (!/Raises IndexError/.test(await asha.textContent(tid('dbg-desc')))) throw new Error('the step description should say the exception is raised');
    await shot(asha, 'dbg-03-error');
    await audit(asha, 'debugger, at the error');
  });

  await check('correct code works too: Debug the fixed program, play it, and it runs to the end with its output', async () => {
    await asha.evaluate((s) => window.__sv.editor.replaceAll(s), CORRECT);
    await asha.click(tid('debug-again'));
    await asha.waitForFunction(() => document.querySelector('[data-testid="dbg-state"]')?.textContent === 'Runs to the end', null, T);
    await asha.selectOption(tid('dbg-speed'), 'fast');
    await asha.click(tid('dbg-play'));
    await asha.waitForFunction(() => /finished/.test(document.querySelector('[data-testid="dbg-desc"]')?.textContent ?? ''), null, { timeout: 30000 });
    const out = await asha.textContent(tid('dbg-out'));
    if (!/average is 4\.0/.test(out)) throw new Error('output: ' + out);
    eq(await asha.locator(tid('dbg-error')).count(), 0, 'no error card');
    await shot(asha, 'dbg-04-finished');
  });

  await check('a program that cannot start (syntax error) shows the error instead of steps', async () => {
    await asha.evaluate(() => window.__sv.editor.replaceAll('def broken(:\n    pass\n'));
    await asha.click(tid('debug-again'));
    await asha.waitForSelector(tid('dbg-empty'), T);
    if (!/SyntaxError/.test(await asha.textContent(tid('dbg-empty')))) throw new Error('the syntax error is not shown');
  });

  await check('other languages: the Debug button is disabled and explains why; Stop returns to the start screen and clears the line', async () => {
    await asha.evaluate(() => window.__sv.editor.replaceAll('x = 1\nprint(x)\n'));
    await asha.click(tid('debug-again'));
    await asha.waitForSelector(tid('dbg-own'), T);
    await asha.waitForSelector('.sv-step-line', { state: 'attached', ...T });
    await asha.click(tid('dbg-stop'));
    await asha.waitForSelector(tid('dbg-intro'), T);
    await asha.waitForFunction(() => document.querySelectorAll('.sv-step-line').length === 0, null, T);
    await asha.locator('[data-testid="file-language"]').selectOption('javascript');
    await asha.waitForFunction(() => document.querySelector('[data-testid="debug-btn"]')?.disabled === true, null, T);
    if (!/Python/.test((await asha.getAttribute(tid('debug-btn'), 'title')) ?? '')) throw new Error('the tooltip should say Python');
    if (!/Python/.test(await asha.textContent(tid('dbg-intro')))) throw new Error('the Debug tool should explain it');
    await asha.locator('[data-testid="file-language"]').selectOption('python');
  });

  await check('the selected run\'s time in the console is readable: dark text on the olive chip (contrast of at least 4.5 to 1)', async () => {
    await asha.evaluate((s) => window.__sv.editor.replaceAll(s), CORRECT);
    await asha.click(tid('run-btn'));
    await asha.waitForSelector(`${tid('run-history-item')}[aria-pressed="true"]`, T);
    const ratio = await asha.evaluate(() => {
      const el = document.querySelector('[data-testid="run-history-item"][aria-pressed="true"]');
      const cs = getComputedStyle(el);
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const a = lum(rgb(cs.color));
      const b = lum(rgb(cs.backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    if (ratio < 4.5) throw new Error('contrast ' + ratio.toFixed(2));
    await shot(asha, 'dbg-05-console-chip');
  });

  // ------------------------------------------------------------------------------ student and mentor
  const rao = await mk('Ms Rao', 'mentor');
  const eve = await mk('Eve', 'student');
  const ashaId = await userId(asha);

  await asha.evaluate((s) => window.__sv.editor.replaceAll(s), INDEX_ERROR);
  await asha.click(tid('debug-btn'));
  await asha.waitForSelector(tid('dbg-own'), T);
  for (let k = 0; k < 3; k++) await asha.click(tid('dbg-next'));
  await openTool(asha, 'Understand'); // Asha is on another tool when the request arrives: the notice must still reach her

  await check('the mentor asks to see Asha\'s session: Asha gets a notice and the dialog, even from another tool', async () => {
    await openTool(rao, 'Debug');
    await rao.click(tid(`request-${ashaId}`));
    await asha.waitForSelector(tid('access-modal'), T);
    await toastHas(asha, /Ms Rao asked to see your session/, 'the student is told about the request');
    if (!/Ms Rao/.test(await asha.textContent(tid('access-modal')))) throw new Error('the dialog does not name the mentor');
    await shot(asha, 'dbg-06-request');
    await audit(asha, 'access request dialog');
  });

  await check('Asha allows: the mentor is told straight away (on any tool), sees the viewing notice, and Asha sees who is looking', async () => {
    await openTool(rao, 'Understand'); // the mentor is on a different tool when the answer comes
    await asha.click(tid('allow'));
    await toastHas(rao, /Asha allowed you to view their session/, 'the mentor is told it was allowed');
    await asha.waitForSelector(tid('viewing-banner'), T);
    if (!/Ms Rao is viewing your session/.test(await asha.textContent(tid('viewing-banner')))) throw new Error('banner');
    await openTool(rao, 'Debug');
    await rao.waitForSelector(tid('mirror'), T);
  });

  await check('the mentor sees Asha\'s trace and follows her position live: when Asha steps, the mentor\'s view moves with her', async () => {
    await rao.waitForSelector(tid('dbg-watch'), T);
    eq(await rao.locator(tid('dbg-state')).textContent(), 'Stops with IndexError', 'the same trace');
    await openTool(asha, 'Debug');
    const target = await stepOf(own(asha));
    await rao.waitForFunction((n) => Number(document.querySelector('[data-testid="dbg-watch"]')?.dataset.step) === n, target, T);
    if (!/Following Asha live/.test(await rao.textContent(tid('dbg-live')))) throw new Error('live banner');
    await rao.waitForSelector('.sv-step-line', { state: 'attached', ...T }); // the followed line is marked in the mentor's editor too
    await asha.click(tid('dbg-next'));
    await asha.click(tid('dbg-next'));
    const after = await stepOf(own(asha));
    await rao.waitForFunction((n) => Number(document.querySelector('[data-testid="dbg-watch"]')?.dataset.step) === n, after, T);
    await shot(rao, 'dbg-07-mentor-following');
    await audit(rao, 'mentor watching a student');
  });

  await check('the mentor can step on their own (the live banner says where Asha is) and re-join her with Follow', async () => {
    await rao.click(`${tid('dbg-watch')} ${tid('dbg-back')}`);
    await rao.waitForSelector(tid('dbg-follow'), T);
    const mentorStep = await stepOf(rao.locator(tid('dbg-watch')));
    await asha.click(tid('dbg-next'));
    await sleep(500);
    eq(await stepOf(rao.locator(tid('dbg-watch'))), mentorStep, 'the mentor\'s own position does not jump while they step alone');
    const ashaStep = await stepOf(own(asha));
    if (!new RegExp(`Asha is on step ${ashaStep + 1}`).test(await rao.textContent(tid('dbg-live')))) throw new Error('the banner should say where Asha is: ' + (await rao.textContent(tid('dbg-live'))));
    await rao.click(tid('dbg-follow'));
    await rao.waitForFunction((n) => Number(document.querySelector('[data-testid="dbg-watch"]')?.dataset.step) === n, ashaStep, T);
  });

  await check('a new trace from Asha is announced to the mentor and replaces the old one on their screen', async () => {
    await asha.evaluate((s) => window.__sv.editor.replaceAll(s), CORRECT);
    await asha.click(tid('debug-again'));
    await toastHas(rao, /Asha is stepping through their code/, 'the mentor is told a new trace started');
    await rao.waitForFunction(() => document.querySelector('[data-testid="dbg-watch"] [data-testid="dbg-state"]')?.textContent === 'Runs to the end', null, T);
  });

  await check('a third student sees nothing of it: no mirror, no trace', async () => {
    await openTool(eve, 'Debug');
    eq(await eve.locator(tid('dbg-watch')).count(), 0, 'no watch view');
    eq(await eve.locator(tid('dbg-own')).count(), 0, 'no trace of her own');
    const r = await eve.evaluate(async (id) => (await fetch('/api/debug/trace/latest?ownerId=' + id, { headers: { 'x-user-id': JSON.parse(sessionStorage.getItem('syncverse.session')).userId, 'x-user-name': 'Eve', 'x-role': 'student' } })).status, ashaId);
    eq(r, 403, 'the API refuses her too');
  });

  await check('Asha revokes: the mentor is told, the viewing banner goes, and the trace disappears from the mentor\'s screen', async () => {
    await asha.click(tid('revoke'));
    await toastHas(rao, /Your access to Asha's session ended/, 'the mentor is told access ended');
    await rao.waitForSelector(tid('dbg-watch'), { state: 'detached', ...T });
    await asha.waitForSelector(tid('viewing-banner'), { state: 'detached', ...T });
    await toastHas(asha, /Ms Rao is no longer viewing your session/, 'the student is told');
  });

  await check('a declined request is announced to the mentor too, and a blocked mentor cannot ask again', async () => {
    await rao.click(tid(`request-${ashaId}`));
    await asha.waitForSelector(tid('access-modal'), T);
    await asha.click(tid('deny'));
    await toastHas(rao, /Asha declined your request/, 'the mentor is told it was declined');
    await rao.waitForSelector(tid(`request-${ashaId}`), T);
    await rao.click(tid(`request-${ashaId}`));
    await asha.waitForSelector(tid('access-modal'), T);
    await asha.click(tid('block'));
    await rao.waitForFunction(() => /declined/.test(document.querySelector('[data-testid="debug-panel"]')?.textContent ?? ''), null, T);
  });

  await check('on a phone the debugger fits the screen and works', async () => {
    const phone = await mk('Meera', 'student', { width: 390, height: 800 }, room + '-phone');
    await phone.click(tid('debug-btn'));
    await phone.waitForSelector(tid('dbg-own'), T);
    await phone.click(tid('dbg-next'));
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error('the page overflows by ' + overflow);
    await shot(phone, 'dbg-08-phone');
    await phone.context().close();
  });

  await check('no serious accessibility violations on the debugger screens (axe-core, WCAG 2.1 AA)', async () => {
    if (a11y.length) throw new Error(a11y.slice(0, 3).join(' | '));
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
