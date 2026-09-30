// Lane D browser test for the assist features (re-run + suggested edits) with a real student and a real mentor.
// Needs the dev servers running:  npm run dev      Then:  node scripts/e2e-lane-d-assist.mjs   (E2E_SHOTS=<dir> saves screenshots)
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const SHOTS = process.env.E2E_SHOTS;
const room = 'eda-' + Math.random().toString(36).slice(2, 7);
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n').slice(0, 4).join(' | ')]);
  }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid=${id}]`;
const W = { timeout: 9000 };

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const mk = async (name, role) => {
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 860 } })).newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await page.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await page.waitForSelector('.monaco-editor', { timeout: 20000 });
  await openTool(page, 'Debug');
  return page;
};
const setCode = (p, t) => p.evaluate((x) => window.__sv.editor.replaceAll(x), t);
const codeOf = (p) => p.evaluate(() => window.__sv.editor.getValue());
const waitCode = (p, sub, ms = 9000) => p.waitForFunction((s) => window.__sv.editor.getValue().includes(s), sub, { timeout: ms });
const runId = (p) => p.$eval(T('run-status'), (e) => e.dataset.runId).catch(() => null);
async function runAndWait(p) {
  const before = await runId(p);
  await p.click(T('run-btn'));
  await p.waitForFunction((b) => { const s = document.querySelector('[data-testid=run-status]'); return s && s.dataset.runId && s.dataset.runId !== b && s.dataset.status !== 'running'; }, before, { timeout: 45000 });
  return p.$eval(T('run-status'), (e) => e.dataset.status);
}
/** axe audit of ONE part of the page (the new Lane D elements), so other lanes' markup does not hide or cause results. */
async function axe(p, label, selector) {
  await p.addScriptTag({ path: axePath });
  const r = await p.evaluate((sel) => window.axe.run({ include: [[sel]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }), selector);
  const bad = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  if (bad.length) throw new Error(`${label}: ${bad.join(' ;; ')}`);
  return r.passes.length;
}

const CODE = 'def f(xs):\n    return xs[len(xs)]\n\n\nprint(f([1, 2, 3]))\n';
const FIXED = CODE.replace('xs[len(xs)]', 'xs[len(xs) - 1]');

const S = await mk('Stu', 'student');
const M = await mk('Mia', 'mentor');
await S.waitForFunction(() => window.__sv?.editor.getValue().includes('def average'), null, W);
await setCode(S, CODE);
await waitCode(M, 'len(xs)');

await check('the student runs the program and it fails (so the helper has something to look at)', async () => {
  eq(await runAndWait(S), 'runtime_error', 'status');
});

await check('VIEW-ONLY access: the mirror shows, but there are NO assist tools', async () => {
  await M.click('[data-testid^=request-]');
  await S.waitForSelector(T('access-modal'), W);
  await S.click(T('allow'));
  await M.waitForSelector(T('mirror'), W);
  eq(await M.$(T('assist-tools')), null, 'assist tools hidden');
  await S.click(T('revoke'));
  await M.waitForSelector(T('mirror'), { state: 'detached', ...W });
});

await check('the consent dialog tells the student what "assist" includes', async () => {
  await M.click('[data-testid^=request-]');
  await S.waitForSelector(T('access-modal'), W);
  const title = await S.$eval(T('allow-assist'), (e) => e.getAttribute('title'));
  if (!/re-run/.test(title) || !/suggest edits/.test(title) || !/accept or reject/.test(title)) throw new Error(title);
  await S.click(T('allow-assist'));
  await M.waitForSelector(T('assist-tools'), W);
});

await check('RE-RUN: the helper re-runs the student\'s program; the result is shown to the helper only and the student\'s own console is untouched', async () => {
  const studentRunsBefore = await S.$$eval(T('run-history-item'), (e) => e.length);
  await M.click(T('rerun-btn'));
  await M.waitForSelector(T('rerun-result'), { timeout: 45000 });
  const t = await M.$eval(T('rerun-result'), (e) => e.textContent);
  if (!/runtime error/.test(t) || !/line 2/.test(t) || !/only you can see this/.test(t)) throw new Error(t);
  eq(await S.$$eval(T('run-history-item'), (e) => e.length), studentRunsBefore, 'student run history unchanged');
  if (await S.$(T('rerun-result'))) throw new Error('student must not see the helper\'s re-run');
});

await check('SUGGEST: the form starts from the shared file; nothing can be sent until something changes', async () => {
  await M.click(T('suggest-open'));
  eq(await M.$eval(T('suggest-text'), (e) => e.value), await codeOf(M), 'prefilled with the shared file');
  eq(await M.$eval(T('suggest-send'), (e) => e.disabled), true, 'send disabled while identical');
});

await check('the student sees a DIFF of the suggestion with the helper\'s note; nothing has changed in their file yet', async () => {
  await M.fill(T('suggest-text'), FIXED);
  await M.fill(T('suggest-note'), 'the last index is len - 1');
  await M.click(T('suggest-send'));
  await S.waitForSelector(T('proposal-modal'), W);
  const info = await S.$eval(T('proposal-modal'), (e) => e.textContent);
  if (!/Mia suggests a change/.test(info) || !/the last index is len - 1/.test(info) || !/Nothing changes unless you accept/.test(info)) throw new Error(info);
  const kinds = await S.$$eval(`${T('proposal-diff')} [data-kind]`, (els) => els.map((e) => e.dataset.kind + ':' + e.textContent.trim()));
  if (!kinds.some((k) => k.startsWith('del:') && k.includes('xs[len(xs)]'))) throw new Error('missing removed line: ' + kinds.join(' | '));
  if (!kinds.some((k) => k.startsWith('add:') && k.includes('xs[len(xs) - 1]'))) throw new Error('missing added line: ' + kinds.join(' | '));
  eq(await codeOf(S), CODE, 'the file is unchanged');
  eq(await S.$eval(T('proposal-accept'), (e) => e.disabled), false, 'accept enabled');
});

await check('the dialog passes the accessibility audit (axe, WCAG A/AA) in light and dark themes', async () => {
  await axe(S, 'light', T('proposal-modal'));
  await S.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await axe(S, 'dark', T('proposal-modal'));
  if (SHOTS) await S.screenshot({ path: `${SHOTS}/assist-dialog-dark.png` });
  await S.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  if (SHOTS) await S.screenshot({ path: `${SHOTS}/assist-dialog-light.png` });
});

await check('REJECT: the dialog closes, the file is unchanged, the helper is told it was declined', async () => {
  await S.click(T('proposal-reject'));
  await S.waitForSelector(T('proposal-modal'), { state: 'detached', ...W });
  eq(await codeOf(S), CODE, 'student file');
  await M.waitForSelector(T('suggest-result'), W);
  const t = await M.$eval(T('suggest-result'), (e) => e.textContent);
  if (!/Stu declined your suggestion/.test(t)) throw new Error(t);
  eq(await codeOf(M), CODE, 'shared file seen by the helper');
});

await check('STALE: if the file changes after the suggestion was made, Accept is blocked and the student is told why', async () => {
  await sleep(2200); // server spacing between suggestions
  await M.fill(T('suggest-text'), FIXED);
  await M.click(T('suggest-send'));
  await S.waitForSelector(T('proposal-modal'), W);
  await setCode(S, CODE + '# the student kept working\n');
  await S.waitForSelector(T('proposal-stale'), W);
  eq(await S.$eval(T('proposal-accept'), (e) => e.disabled), true, 'accept disabled');
  await S.click(T('proposal-reject'));
  await S.waitForSelector(T('proposal-modal'), { state: 'detached', ...W });
});

await check('after an answer the form restarts from the CURRENT shared file, and "Start over" does the same on demand', async () => {
  // The previous suggestion was rejected while the student's file had changed: the helper's form must already show the new file.
  eq(await M.$eval(T('suggest-text'), (e) => e.value), await codeOf(M), 'form refreshed after the answer');
  await setCode(S, (await codeOf(S)) + '# another student edit\n');
  await waitCode(M, 'another student edit');
  await M.fill(T('suggest-text'), 'something I typed and will throw away');
  await M.click(T('suggest-reload'));
  eq(await M.$eval(T('suggest-text'), (e) => e.value), await codeOf(M), 'start over reloads the shared file');
});

await check('ACCEPT: the suggestion is applied to the SHARED file for both people; the helper is told', async () => {
  await sleep(2200);
  const base = await codeOf(M);
  await M.fill(T('suggest-text'), base.replace('xs[len(xs)]', 'xs[len(xs) - 1]'));
  await M.click(T('suggest-send'));
  await S.waitForSelector(T('proposal-modal'), W);
  await S.click(T('proposal-accept'));
  await S.waitForSelector(T('proposal-modal'), { state: 'detached', ...W });
  await waitCode(S, 'xs[len(xs) - 1]');
  await waitCode(M, 'xs[len(xs) - 1]');
  eq(await codeOf(S), await codeOf(M), 'both editors identical');
  await M.waitForFunction(() => /accepted your suggestion/.test(document.querySelector('[data-testid=suggest-result]')?.textContent ?? ''), null, W);
});

await check('a pending suggestion comes back after the student refreshes the page', async () => {
  await sleep(2200);
  await M.fill(T('suggest-text'), (await codeOf(M)) + '# a mentor note\n');
  await M.click(T('suggest-send'));
  await S.waitForSelector(T('proposal-modal'), W);
  await S.reload();
  await S.waitForSelector('.monaco-editor', { timeout: 20000 });
  await S.waitForSelector(T('proposal-modal'), W); // it is back on whatever tab the student has open
  eq(await S.$$eval(T('proposal-modal'), (e) => e.length), 1, 'exactly one dialog');
  // It stays pending on purpose: the next check revokes access while it is still waiting.
});

await check('REVOKING access withdraws a pending suggestion: the dialog disappears by itself and the tools go away', async () => {
  eq(await S.$$eval(T('proposal-modal'), (e) => e.length), 1, 'a suggestion is really pending before the revoke');
  await M.click('button:has-text("Stop viewing")');
  await S.waitForSelector(T('proposal-modal'), { state: 'detached', ...W });
  await M.waitForSelector(T('assist-tools'), { state: 'detached', ...W });
});

await check('the assist tools pass the accessibility audit too (new assist grant, both themes)', async () => {
  await M.click('[data-testid^=request-]');
  await S.waitForSelector(T('access-modal'), W);
  await S.click(T('allow-assist'));
  await M.waitForSelector(T('assist-tools'), W);
  await M.click(T('suggest-open'));
  await axe(M, 'light', T('assist-tools'));
  await M.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await axe(M, 'dark', T('assist-tools'));
  if (SHOTS) await M.screenshot({ path: `${SHOTS}/assist-tools-dark.png` });
});

await browser.close();
let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
