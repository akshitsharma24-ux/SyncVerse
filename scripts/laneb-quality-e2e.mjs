// Lane B (Simrit) browser checks for P-B4 (quality panel). Needs the dev servers running:  npm run dev
//   node scripts/laneb-quality-e2e.mjs        (E2E_SHOTS=<dir> also saves a screenshot)
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const SHOTS = process.env.E2E_SHOTS;
const room = 'laneb-q-' + Math.random().toString(36).slice(2, 7);
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
const T = (id) => `[data-testid=${id}]`;

const SAMPLE = `def process(data):
    x = 0
    for row in data:
        for item in row:
            x = x + item * 86400
    return x


def run(user_text):
    result = eval(user_text)
    message = "this is a deliberately long line that keeps going and going so that it passes the one hundred character limit"
    return result, message
`;
const FIXED = SAMPLE.replace('eval(user_text)', 'int(user_text)');
const STARTER = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const analyzeRequests = [];
page.on('request', (r) => {
  if (r.url().endsWith('/api/analyze')) analyzeRequests.push({ t: Date.now(), body: r.postData() });
});
await page.goto(`${BASE}/?name=Asha&role=student&room=${room}`);
await page.waitForSelector('.monaco-editor', { timeout: 20000 });
await page.waitForFunction(() => window.__sv?.editor.getValue().includes('def average'), null, { timeout: 10000 });
await page.click('button[role=tab]:has-text("Quality")');
await page.waitForSelector(T('quality-panel'));

const setCode = (t) => page.evaluate((x) => window.__sv.editor.replaceAll(x), t);
const groups = () => page.$$eval(T('quality-group'), (els) => els.map((e) => e.dataset.category));
const items = () => page.$$eval(T('quality-item'), (els) => els.map((e) => `${e.dataset.rule}@${e.dataset.line}`));
const waitFor = (fn, arg, ms = 9000) => page.waitForFunction(fn, arg, { timeout: ms });
const squig = (kind) => page.$$eval(`.monaco-editor .squiggly-${kind}`, (e) => e.length);
const highlighted = () =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll('.monaco-editor .view-lines .view-line')];
    return [...document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line')].map((o) => {
      const l = lines.find((x) => x.style.top === o.parentElement.style.top);
      return l ? l.textContent.replace(/ /g, ' ') : null;
    });
  });

await check('the room starter program is analysed and has no findings', async () => {
  await page.waitForSelector(T('quality-empty'), { timeout: 9000 });
  const t = await page.$eval(T('quality-empty'), (e) => e.textContent);
  if (!/No findings/.test(t)) throw new Error(t);
  eq(await items(), [], 'items');
});

await check('the plan sample lists formatting, naming, smell, complexity and security findings', async () => {
  await setCode(SAMPLE);
  await waitFor(() => document.querySelectorAll('[data-testid=quality-group]').length >= 5);
  eq((await groups()).sort(), ['complexity', 'formatting', 'naming', 'security', 'smell'], 'categories');
  const it = await items();
  for (const want of ['one-letter-name@2', 'nested-loops@4', 'magic-number@5', 'dangerous-call@10', 'line-too-long@11']) {
    if (!it.includes(want)) throw new Error(`missing ${want}: ${it.join(' ')}`);
  }
});

await check('groups are ordered by importance (security first) and show counts', async () => {
  eq((await groups())[0], 'security', 'first group');
  const counts = await page.$$eval(`${T('quality-group')} .q-count`, (e) => e.map((x) => Number(x.textContent)));
  if (counts.some((c) => !(c >= 1))) throw new Error('counts ' + counts);
});

await check('summary: Safety needs attention (eval is an error), no numeric score anywhere', async () => {
  const safety = await page.$eval(`${T('quality-summary')} [data-dimension=Safety]`, (e) => e.textContent);
  if (!/Needs attention/.test(safety)) throw new Error(safety);
  const text = await page.$eval(T('quality-panel'), (e) => e.textContent);
  if (/\b\d+\s*\/\s*100\b|score:/i.test(text)) throw new Error('looks like a score');
  if (!/not a grade/.test(text)) throw new Error('disclaimer missing');
});

await check('findings appear in the editor as markers (an error squiggle for eval, warnings for the rest)', async () => {
  await waitFor(() => document.querySelectorAll('.monaco-editor .squiggly-error').length >= 1);
  if ((await squig('warning')) < 1) throw new Error('no warning squiggle');
});

await check('clicking a finding jumps to and highlights its line', async () => {
  await page.click(`${T('quality-item')}[data-rule=dangerous-call]`);
  await waitFor(() => document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line').length > 0);
  const h = await highlighted();
  if (!h[0] || !h[0].includes('eval(user_text)')) throw new Error('highlighted: ' + JSON.stringify(h));
  // It is only a flash: it must go away by itself (a permanent red band would look like an error).
  await waitFor(() => document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line').length === 0, null, 6000);
});

await check('fixing the eval line removes its finding, the security group and the error squiggle', async () => {
  await setCode(FIXED);
  await waitFor(() => !document.querySelector('[data-testid=quality-item][data-rule=dangerous-call]'));
  if ((await groups()).includes('security')) throw new Error('security group still there');
  await waitFor(() => document.querySelectorAll('.monaco-editor .squiggly-error').length === 0);
  const it = await items();
  if (!it.includes('line-too-long@11')) throw new Error('other findings should remain: ' + it.join(' '));
});

await check('debounce: nothing is sent while typing continues; exactly one request 1.5 s after the last edit', async () => {
  await sleep(2500); // let the previous analysis settle
  const before = analyzeRequests.length;
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    await setCode(FIXED + '# edit ' + i + '\n');
    await sleep(350);
  }
  const duringTyping = analyzeRequests.length - before;
  eq(duringTyping, 0, 'requests while typing (over ' + (Date.now() - t0) + ' ms)');
  await waitFor(() => document.querySelector('[data-testid=quality-status]')?.dataset.phase === 'idle', null, 9000);
  eq(analyzeRequests.length - before, 1, 'requests after the quiet period');
  if (analyzeRequests.at(-1).body.includes('"log"')) throw new Error('automatic runs must not log');
});

await check('Analyze now sends immediately (with log + roomCode) and shows a "Checked" time', async () => {
  await sleep(1800);
  const before = analyzeRequests.length;
  await page.click(T('quality-analyze'));
  await waitFor(() => /Checked/.test(document.querySelector('[data-testid=quality-status]')?.textContent ?? ''));
  eq(analyzeRequests.length - before, 1, 'one request');
  const body = JSON.parse(analyzeRequests.at(-1).body);
  eq(body.log, true, 'log flag');
  eq(body.roomCode, room, 'room code');
});

await check('lint markers and the run-error marker coexist (neither erases the other)', async () => {
  await setCode('x = 5\nprint(totl)\n');
  await waitFor(() => document.querySelector('[data-testid=quality-item][data-rule=one-letter-name]'));
  await page.click(T('run-btn'));
  await waitFor(() => document.querySelector('[data-testid=run-status]')?.dataset.status === 'runtime_error', null, 40000);
  await waitFor(() => document.querySelectorAll('.monaco-editor .squiggly-error').length >= 1);
  if ((await squig('info')) < 1) throw new Error('lint (info) squiggle vanished after the run marker appeared');
  await page.click(T('quality-analyze')); // lint markers are re-published: the run marker must survive
  await waitFor(() => /Checked/.test(document.querySelector('[data-testid=quality-status]')?.textContent ?? ''));
  await sleep(300);
  if ((await squig('error')) < 1) throw new Error('run error marker was erased by a lint refresh');
  if ((await squig('info')) < 1) throw new Error('lint squiggle missing');
});

await check('an empty editor shows "Nothing to check yet" and clears the markers', async () => {
  await setCode('   \n');
  await waitFor(() => /Nothing to check yet/.test(document.querySelector('[data-testid=quality-empty]')?.textContent ?? ''));
  await waitFor(() => document.querySelectorAll('.monaco-editor .squiggly-info').length === 0);
});

await check('the run error marker still works after the quality panel published markers (starter -> line 4)', async () => {
  await sleep(2200);
  await setCode(STARTER);
  await page.click(T('run-btn'));
  await waitFor(() => document.querySelector('[data-testid=run-status]')?.dataset.status === 'runtime_error', null, 40000);
  await waitFor(() => document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line').length > 0);
  const h = await highlighted();
  if (!h[0].includes('total += nums[i]')) throw new Error(JSON.stringify(h));
});

if (SHOTS) {
  await setCode(SAMPLE);
  await waitFor(() => document.querySelectorAll('[data-testid=quality-group]').length >= 5);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/quality.png` });
}
await browser.close();

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
