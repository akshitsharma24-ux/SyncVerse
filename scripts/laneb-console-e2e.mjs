// Lane B (Simrit) browser checks for P-B2 (console panel) with three real users in one room.
// Needs the dev servers running:  npm run dev     then     node scripts/laneb-console-e2e.mjs
// Uses the installed Microsoft Edge via playwright-core (E2E_CHANNEL=chrome to change). Screenshots go to E2E_SHOTS if set.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const SHOTS = process.env.E2E_SHOTS;
const room = 'laneb-' + Math.random().toString(36).slice(2, 7);
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const pages = [];
const mk = async (name, role = 'student', viewport = { width: 1300, height: 820 }) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await page.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await page.waitForSelector('.monaco-editor', { timeout: 20000 });
  await page.waitForSelector('[data-testid=run-panel]', { timeout: 10000 });
  pages.push(page);
  return page;
};
const T = (id) => `[data-testid=${id}]`;
const runId = (p) => p.$eval(T('run-status'), (e) => e.dataset.runId).catch(() => null);
const setCode = (p, text) => p.evaluate((t) => window.__sv.editor.replaceAll(t), text);
const codeOf = (p) => p.evaluate(() => window.__sv.editor.getValue());
/** Click Run (or press the given key combo) and wait until a NEW run has finished. Returns the finished status. */
async function runAndWait(p, how = 'click') {
  const before = await runId(p);
  if (how === 'click') await p.click(T('run-btn'));
  else await p.keyboard.press(how);
  await p.waitForFunction(
    (b) => {
      const s = document.querySelector('[data-testid=run-status]');
      return s && s.dataset.runId && s.dataset.runId !== b && s.dataset.status !== 'running';
    },
    before,
    { timeout: 40000 },
  );
  return p.$eval(T('run-status'), (e) => e.dataset.status);
}
const stdoutOf = async (p) => {
  await p.click(T('tab-stdout'));
  return p.$eval(T('run-stdout'), (e) => e.textContent);
};


// Text of the editor line(s) that carry the error highlight (matched through Monaco's absolute `top`), and squiggle count.
const marked = (p) =>
  p.evaluate(() => {
    const lines = [...document.querySelectorAll('.monaco-editor .view-lines .view-line')];
    return [...document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line')].map((o) => {
      const l = lines.find((x) => x.style.top === o.parentElement.style.top);
      return l ? l.textContent.replace(/\u00a0/g, ' ') : null;
    });
  });
const squiggles = (p) => p.$$eval('.monaco-editor .squiggly-error', (e) => e.length);
const waitMarked = (p, present = true) =>
  p.waitForFunction(
    (want) => (document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line').length > 0) === want,
    present,
    { timeout: 8000 },
  );

const PROG = 'name = input()\nprint("hello " + name)\n';
const STARTER = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';

try {
  const [A, B, C] = [await mk('Asha'), await mk('Ben'), await mk('Cy')];

  await check('panel renders with Run button, stdin box and the empty-state hint', async () => {
    await A.waitForSelector(T('run-btn'));
    await A.waitForSelector(T('stdin-input'));
    const t = await A.$eval(T('run-stdout'), (e) => e.textContent);
    if (!/Press Run/.test(t)) throw new Error('hint missing: ' + t);
  });

  await check('three people run the same file with different stdin; each sees only their own output', async () => {
    await A.waitForFunction(() => window.__sv?.editor.getValue().includes('def average'));
    await setCode(A, PROG);
    for (const p of [B, C]) await p.waitForFunction(() => window.__sv.editor.getValue().startsWith('name = input()'), null, { timeout: 8000 });
    const names = ['Asha', 'Ben', 'Cy'];
    await Promise.all([A, B, C].map((p, i) => p.fill(T('stdin-input'), names[i])));
    const statuses = await Promise.all([A, B, C].map((p) => runAndWait(p)));
    eq(statuses.join(','), 'success,success,success', 'statuses');
    const outs = await Promise.all([A, B, C].map(stdoutOf));
    names.forEach((n, i) => {
      eq(outs[i], `hello ${n}\n`, `stdout of ${n}`);
      for (const other of names.filter((x) => x !== n)) if (outs[i].includes(other)) throw new Error(`${n} sees ${other}'s output`);
    });
  });

  await check('status badge shows Success with time and memory; history has 1 item', async () => {
    eq(await A.$eval(T('run-status'), (e) => e.textContent.trim()), 'Success', 'badge');
    const meta = await A.$eval(T('run-meta'), (e) => e.textContent);
    if (!/(ms|s)/.test(meta) || !/MB/.test(meta)) throw new Error('meta: ' + meta);
    eq((await A.$$(T('run-history-item'))).length, 1, 'history');
  });

  await check("privacy: Ben's browser cannot read Asha's run through the API (403)", async () => {
    const id = await runId(A);
    const status = await B.evaluate(async (rid) => {
      const s = JSON.parse(sessionStorage.getItem('syncverse.session'));
      const r = await fetch('/api/run/' + rid, { headers: { 'x-user-id': s.userId, 'x-user-name': s.name, 'x-role': s.role } });
      return r.status;
    }, id);
    eq(status, 403, 'HTTP status');
  });

  await check('Ctrl+Enter inside the editor runs the code and does NOT insert a newline', async () => {
    await sleep(2200); // per-user run spacing is 2 s
    const before = await codeOf(A);
    await A.click('.monaco-editor .view-lines');
    const status = await runAndWait(A, 'Control+Enter');
    eq(status, 'success', 'status');
    eq(await codeOf(A), before, 'editor text unchanged');
  });

  await check('a failing run: Runtime error badge, Errors tab opens, message and line shown', async () => {
    await sleep(2200);
    await setCode(A, STARTER);
    await A.fill(T('stdin-input'), '');
    const status = await runAndWait(A);
    eq(status, 'runtime_error', 'status');
    eq(await A.$eval(T('run-status'), (e) => e.textContent.trim()), 'Runtime error', 'badge text');
    const err = await A.$eval(T('run-stderr'), (e) => e.textContent);
    if (!/IndexError: list index out of range/.test(err)) throw new Error('stderr: ' + err.slice(-80));
    const row = await A.$eval(T('run-error'), (e) => e.textContent);
    if (!/IndexError/.test(row) || !/line 4/.test(row)) throw new Error('error row: ' + row);
  });

  await check('error line is highlighted and underlined in the editor (line 4: total += nums[i])', async () => {
    await waitMarked(A);
    const m = await marked(A);
    eq(m.length, 1, 'highlighted lines');
    if (!m[0].includes('total += nums[i]')) throw new Error('wrong line highlighted: ' + m[0]);
    const q = await squiggles(A);
    if (q < 1) throw new Error('no squiggle');
  });

  await check('clicking the error row scrolls a far-away editor back to the failing line', async () => {
    await sleep(2200);
    await setCode(A, STARTER + '\n'.repeat(90) + '# end\n');
    eq(await runAndWait(A), 'runtime_error', 'status');
    await waitMarked(A);
    await A.click('.monaco-editor .view-lines');
    await A.keyboard.press('Control+End'); // scroll to the bottom; line 4 leaves the viewport
    await waitMarked(A, false);
    await A.click(T('run-error'));
    await waitMarked(A);
    if (!(await marked(A))[0].includes('total += nums[i]')) throw new Error('jumped to the wrong line');
    await A.click('.monaco-editor .view-lines');
    await A.keyboard.press('Control+End');
    await waitMarked(A, false);
    await A.click(T('run-error-line'));
    await waitMarked(A);
  });

  await check('reload restores the marker on the failing line', async () => {
    await A.reload();
    await A.waitForSelector('.monaco-editor', { timeout: 20000 });
    await waitMarked(A);
    if (!(await marked(A))[0].includes('total += nums[i]')) throw new Error('wrong line after reload');
  });

  await check('a successful run clears the marker and the underline', async () => {
    await sleep(2200);
    await setCode(A, 'print("fixed")\n');
    eq(await runAndWait(A), 'success', 'status');
    await waitMarked(A, false);
    eq(await squiggles(A), 0, 'squiggles');
  });

  await check('no marker when a collaborator edits the failing line while the run is in flight', async () => {
    await sleep(2200);
    await setCode(A, STARTER);
    await A.waitForFunction(() => window.__sv.editor.getValue().includes('def average'));
    const before = await runId(A);
    await A.click(T('run-btn'));
    await setCode(B, STARTER.replace('total += nums[i]', 'total += nums[i] + 0')); // line 4 changes at once
    await A.waitForFunction((b) => {
      const s = document.querySelector('[data-testid=run-status]');
      return s?.dataset.runId !== b && s?.dataset.status !== 'running';
    }, before, { timeout: 40000 });
    eq(await A.$eval(T('run-status'), (e) => e.dataset.status), 'runtime_error', 'run status');
    await sleep(300);
    eq((await marked(A)).length, 0, 'highlight count');
  });

  await check('replacing the whole file after a failed run clears the highlight and marker (no whole-file red band)', async () => {
    await sleep(2200);
    await setCode(A, STARTER);
    eq(await runAndWait(A), 'runtime_error', 'status');
    await waitMarked(A);
    await setCode(A, 'print("brand new file")\n' + '\n'.repeat(30));
    await waitMarked(A, false); // the highlight must not stretch over the new text
    await A.waitForFunction(() => document.querySelectorAll('.monaco-editor .squiggly-error').length === 0, null, { timeout: 4000 });
  });

  await check('editing the failing line removes its marker; editing elsewhere below it keeps it', async () => {
    await sleep(2200);
    await setCode(A, STARTER);
    eq(await runAndWait(A), 'runtime_error', 'status');
    await waitMarked(A);
    await setCode(A, STARTER + '# a comment added below the error\n');
    await sleep(1200);
    // A whole-file replace must not leave a swollen marker: one squiggle on line 4 only (a stretched one would be 9+ pieces).
    const pieces = await squiggles(A);
    if (pieces < 1 || pieces > 2) throw new Error(`expected the marker to survive on one line, found ${pieces} squiggle pieces`);
    await setCode(A, STARTER.replace('total += nums[i]', 'total += nums[i - 1]'));
    await A.waitForFunction(() => document.querySelectorAll('.monaco-editor .squiggly-error').length === 0, null, { timeout: 4000 });
  });

  await check('a syntax error is shown as Compile error', async () => {
    await sleep(2200);
    await setCode(A, 'def greet(name)\n    print(name)\n');
    eq(await runAndWait(A), 'compile_error', 'status');
    eq(await A.$eval(T('run-status'), (e) => e.textContent.trim()), 'Compile error', 'badge');
  });

  await check('a run of only whitespace shows a notice and starts nothing', async () => {
    await sleep(2200);
    await setCode(A, '   \n');
    const before = await runId(A);
    await A.click(T('run-btn'));
    await A.waitForSelector(T('run-notice'));
    eq(await runId(A), before, 'no new run');
  });

  await check('two quick Ctrl+Enter presses start only one run', async () => {
    await sleep(2200);
    await setCode(A, 'print("once")\n');
    await A.click('.monaco-editor .view-lines');
    const before = await runId(A);
    await A.keyboard.press('Control+Enter');
    await A.keyboard.press('Control+Enter');
    await A.waitForFunction((b) => document.querySelector('[data-testid=run-status]')?.dataset.runId !== b && document.querySelector('[data-testid=run-status]')?.dataset.status !== 'running', before, { timeout: 40000 });
    await sleep(3500); // a second run, if one had started, would have appeared by now
    const chips = await A.$$eval(T('run-history-item'), (els) => els.length);
    await A.click(T('tab-stdout'));
    eq(await A.$eval(T('run-stdout'), (e) => e.textContent), 'once\n', 'stdout');
    // A second POST inside 2 s would have been answered 429 and shown as a notice.
    eq(await A.$(T('run-notice')), null, 'no "too fast" notice, so no second request was sent');
    return `history=${chips}`;
  });

  await check('reload keeps this person\'s latest run (picked up from the server)', async () => {
    const id = await runId(A);
    await A.reload();
    await A.waitForSelector(T('run-status'), { timeout: 15000 });
    eq(await runId(A), id, 'same run after reload');
  });

  await check('a run started by Ben never appears in Cy\'s console', async () => {
    const cyId = await runId(C);
    await sleep(2200);
    await setCode(B, 'print("ben only")\n');
    eq(await runAndWait(B), 'success', 'ben run');
    eq(await runId(C), cyId, 'cy unchanged');
    if ((await stdoutOf(C)).includes('ben only')) throw new Error('leak');
  });

  if (SHOTS) {
    await A.screenshot({ path: `${SHOTS}/console-desktop.png` });
    // The workspace shell (Lane A) has no phone layout: at 390 px the console column gets 0 width. Tablet width is checked.
    const M = await mk('Tabby', 'student', { width: 820, height: 800 });
    await setCode(M, PROG);
    await M.fill(T('stdin-input'), 'Tabby');
    await runAndWait(M);
    await M.screenshot({ path: `${SHOTS}/console-tablet.png` });
    const overflow = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await check('tablet width: run works and the page does not scroll sideways', async () => eq(overflow <= 0, true, `overflow ${overflow}px`));
  }
} finally {
  await browser.close();
}
let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
