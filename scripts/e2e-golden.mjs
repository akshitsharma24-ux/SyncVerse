// The demo, end to end, with three browsers. Steps whose panel is not built yet report SKIP (not a failure).
//   npm run e2e:golden              normal: SKIP is fine
//   npm run e2e:golden -- --strict  demo morning: SKIP counts as a failure
// Contract for the UI hooks: docs/TESTIDS.md.   Owner: Lane A.
import { chromium } from 'playwright-core';
import { tsImport } from 'tsx/esm/api';

const { SAMPLE_BY_ID } = await tsImport('../shared/samples.ts', import.meta.url);
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const API = process.env.SMOKE_BASE ?? 'http://localhost:4000';
const STRICT = process.argv.includes('--strict');
const room = 'golden-' + Math.random().toString(36).slice(2, 6);

class Skip extends Error {}
const results = [];
const status = {}; // step id -> 'PASS' | 'SKIP' | 'FAIL'
const tid = (id) => `[data-testid="${id}"]`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(id, title, fn, { after = [] } = {}) {
  const blocked = after.find((a) => status[a] !== 'PASS');
  if (blocked) {
    status[id] = 'SKIP';
    results.push(['SKIP', id, title, `depends on ${blocked}, which did not pass`]);
    return;
  }
  try {
    const detail = await fn();
    status[id] = 'PASS';
    results.push(['PASS', id, title, detail ?? '']);
  } catch (e) {
    if (e instanceof Skip) {
      status[id] = 'SKIP';
      results.push(['SKIP', id, title, e.message]);
    } else {
      status[id] = 'FAIL';
      results.push(['FAIL', id, title, String(e.message).split('\n')[0]]);
    }
  }
}

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
async function join(name, role) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await page.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await page.waitForSelector('.monaco-editor', { timeout: 30000 });
  return page;
}
const asha = await join('Asha', 'mentor');
const ravi = await join('Ravi', 'student');
const mei = await join('Mei', 'student');

const uid = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('syncverse.session')).userId);
const uname = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('syncverse.session')).name);
const value = (p) => p.evaluate(() => window.__sv.editor.getValue());
const exists = async (p, id) => (await p.locator(tid(id)).count()) > 0;
const needPanel = async (p, id, label) => {
  if (!(await exists(p, id))) throw new Skip(`not built yet (no ${id} on the page): ${label}`);
};
async function tab(p, name) {
  await p.getByRole('tab', { name, exact: true }).click();
}
async function apiStatus(path, who) {
  const res = await fetch(API + path, { headers: { 'x-user-id': await uid(who), 'x-user-name': await uname(who), 'x-role': who === asha ? 'mentor' : 'student' } });
  return res.status;
}
async function loadSample(p, id) {
  if (await exists(p, 'samples-menu')) {
    await p.click(tid('samples-menu'));
    await p.click(tid(`sample-${id}`));
  } else {
    await p.evaluate((src) => window.__sv.editor.replaceAll(src), SAMPLE_BY_ID[id].source);
  }
  for (const other of [asha, ravi, mei]) await other.waitForFunction((src) => window.__sv.editor.getValue() === src, SAMPLE_BY_ID[id].source, { timeout: 8000 });
}
async function run(p, stdin) {
  if (await exists(p, 'stdin-input')) await p.fill(tid('stdin-input'), stdin);
  await p.click(tid('run-button'));
}
let raviRunId = '';

// ------------------------------------------------------------------------------------------ the demo steps
await step('G1', 'Three people join one room and see each other', async () => {
  for (const [p, others] of [[asha, ['Ravi', 'Mei']], [ravi, ['Asha', 'Mei']], [mei, ['Asha', 'Ravi']]]) {
    for (const n of others) await p.waitForSelector(`[data-presence^="${n}:"]`, { timeout: 10000 });
  }
});

await step('G2', 'Everyone edits one file: a program loaded by Ravi appears for Asha and Mei', async () => {
  await loadSample(ravi, 'index-error');
}, { after: ['G1'] });

await step('G3', 'Private runs: same code, different input, each sees only their own output', async () => {
  await needPanel(ravi, 'panel-run', 'Lane B console');
  await loadSample(ravi, 'stdin-average');
  await run(ravi, '3 4 5');
  await ravi.waitForFunction((s) => document.querySelector(s)?.textContent.includes('4.0'), tid('run-stdout'), { timeout: 30000 });
  await run(mei, '10 20');
  await mei.waitForFunction((s) => document.querySelector(s)?.textContent.includes('15.0'), tid('run-stdout'), { timeout: 30000 });
  const r = await ravi.textContent(tid('run-stdout'));
  const m = await mei.textContent(tid('run-stdout'));
  if (r.includes('15.0')) throw new Error("Ravi can see Mei's output");
  if (m.includes('4.0')) throw new Error("Mei can see Ravi's output");
}, { after: ['G2'] });

await step('G4', 'A failing run shows its status and marks the error in the editor', async () => {
  await needPanel(ravi, 'panel-run', 'Lane B console');
  await loadSample(ravi, 'index-error');
  await run(ravi, '');
  await ravi.waitForSelector(`${tid('run-status')}[data-status="runtime_error"]`, { timeout: 30000 });
  raviRunId = (await ravi.getAttribute(tid('run-status'), 'data-run-id')) ?? '';
  if (!raviRunId) throw new Error('run-status has no data-run-id');
  await ravi.waitForSelector('.squiggly-error', { timeout: 6000 });
}, { after: ['G2'] });

await step('G5', 'Explain with AI gives a readable explanation card', async () => {
  await needPanel(ravi, 'panel-ai', 'Lane C AI panel');
  await tab(ravi, 'AI');
  await ravi.click(tid('explain-button'));
  await ravi.waitForSelector(tid('explain-card'), { state: 'visible', timeout: 30000 });
  const t = (await ravi.textContent(tid('explain-card'))).trim();
  if (t.length < 30) throw new Error('explanation is too short: ' + JSON.stringify(t));
}, { after: ['G4'] });

await step('G6', 'Patch preview: Reject changes nothing, Accept updates everyone', async () => {
  await tab(ravi, 'AI');
  const before = await value(ravi);
  await ravi.click(tid('patch-show'));
  await ravi.waitForSelector(tid('patch-diff'), { state: 'visible', timeout: 30000 });
  await ravi.click(tid('patch-reject'));
  await sleep(600);
  if ((await value(ravi)) !== before) throw new Error('Reject changed the document');
  if ((await value(mei)) !== before) throw new Error("Reject changed Mei's document");
  await ravi.click(tid('patch-show'));
  await ravi.waitForSelector(tid('patch-diff'), { state: 'visible', timeout: 30000 });
  await ravi.click(tid('patch-accept'));
  await mei.waitForFunction((b) => window.__sv.editor.getValue() !== b, before, { timeout: 8000 });
  const after = await value(mei);
  if (after.includes('+ 1)')) throw new Error('patched text still has the off-by-one: ' + after.split('\n')[2]);
  if ((await value(ravi)) !== after) throw new Error('Ravi and Mei differ after Accept');
}, { after: ['G5'] });

await step('G7', 'Quality panel lists findings in every category', async () => {
  await needPanel(mei, 'panel-quality', 'Lane B quality panel');
  await loadSample(mei, 'quality-smells');
  await tab(mei, 'Quality');
  await mei.waitForFunction((s) => document.querySelectorAll(s).length >= 5, tid('quality-finding'), { timeout: 15000 });
  const cats = new Set(await mei.$$eval(tid('quality-finding'), (els) => els.map((e) => e.getAttribute('data-category'))));
  for (const c of ['formatting', 'naming', 'smell', 'complexity', 'security']) if (!cats.has(c)) throw new Error('no finding in category ' + c + ' (got ' + [...cats].join(', ') + ')');
}, { after: ['G2'] });

await step('G8', 'Debug access: request, allow, mentor sees the console, revoke; privacy holds throughout', async () => {
  await needPanel(asha, 'panel-debug', 'Lane D debug panel');
  if (!raviRunId) throw new Error('no Ravi run id from G4');
  const check = async (who, label, want) => {
    const got = await apiStatus(`/api/run/${raviRunId}`, who);
    if (got !== want) throw new Error(`${label}: GET /api/run/:id returned ${got}, expected ${want}`);
  };
  await check(ravi, 'owner before', 200);
  await check(asha, 'mentor before any grant', 403);
  await check(mei, 'other student', 403);
  await tab(asha, 'Debug');
  await asha.click(`${tid('debug-request')}[data-user="Ravi"]`);
  await ravi.waitForSelector(tid('debug-incoming'), { state: 'visible', timeout: 8000 });
  await check(asha, 'mentor while only requested', 403);
  await ravi.click(tid('debug-allow'));
  await asha.waitForSelector(tid('debug-mirror'), { state: 'visible', timeout: 8000 });
  const mirror = await asha.textContent(tid('debug-mirror'));
  if (!/IndexError|list index/.test(mirror)) throw new Error("mirror does not show Ravi's error: " + JSON.stringify(mirror.slice(0, 80)));
  await check(asha, 'mentor while active', 200);
  await check(mei, 'other student while active', 403);
  await ravi.waitForSelector(tid('debug-banner'), { state: 'visible', timeout: 5000 });
  await ravi.click(tid('debug-revoke'));
  await asha.waitForFunction((s) => !document.querySelector(s) || document.querySelector(s).offsetParent === null, tid('debug-mirror'), { timeout: 8000 });
  await check(asha, 'mentor after revoke', 403);
}, { after: ['G4'] });

await step('G9', 'Progress page shows observation sentences', async () => {
  await needPanel(ravi, 'panel-progress', 'Lane D progress page');
  await tab(ravi, 'Progress');
  await ravi.waitForSelector(tid('progress-observation'), { state: 'visible', timeout: 15000 });
  const t = (await ravi.textContent(tid('progress-observation'))).trim();
  if (t.length < 15) throw new Error('observation too short: ' + JSON.stringify(t));
});

await browser.close();

// ------------------------------------------------------------------------------------------------ report
const icon = { PASS: 'PASS', SKIP: 'SKIP', FAIL: 'FAIL' };
for (const [s, id, title, d] of results) console.log(`${icon[s]}  ${id}  ${title}${d ? '  - ' + d : ''}`);
const n = (k) => results.filter((r) => r[0] === k).length;
console.log(`\nGolden path: ${n('PASS')} live, ${n('SKIP')} not built yet, ${n('FAIL')} failing${STRICT ? '  (strict: skips count as failures)' : ''}`);
process.exit(n('FAIL') > 0 || (STRICT && n('SKIP') > 0) ? 1 : 0);
