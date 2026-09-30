// Two real browser sessions in one room. Needs the dev servers running:  npm run dev   then   npm run e2e
// Uses the installed Microsoft Edge (Windows has it) via playwright-core. Override with E2E_CHANNEL=chrome.
// Owner: Lane A. Add checks for your own feature at the bottom (keep them independent).
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const room = 'e2e-' + Math.random().toString(36).slice(2, 7);
const results = [];
const check = async (name, fn) => {
  try {
    const d = await fn();
    results.push([true, name, d ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const mk = async (name, role) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await page.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await page.waitForSelector('.monaco-editor', { timeout: 20000 });
  return page;
};
// window.__sv.editor is the dev-only EditorHandle hook set by web/src/editor/index.tsx
const textOf = (p) => p.evaluate(() => window.__sv.editor.getValue());
const waitText = (p, pred, label) =>
  p
    .waitForFunction((src) => new Function('t', 'return ' + src)(window.__sv?.editor.getValue() ?? ''), pred, { timeout: 8000 })
    .catch(() => {
      throw new Error('timeout: ' + label);
    });

const A = await mk('Akshit', 'student');
const B = await mk('Miti', 'mentor');

await check('both tabs join the same room and show the starter program once', async () => {
  await waitText(A, `t.includes('def average')`, 'A starter');
  await waitText(B, `t.includes('def average')`, 'B starter');
  const a = await textOf(A);
  if ((a.match(/def average/g) || []).length !== 1) throw new Error('starter duplicated');
  if (a !== (await textOf(B))) throw new Error('A and B differ');
});

await check('status pill says live', () => A.waitForFunction(() => document.body.innerText.includes('live'), null, { timeout: 8000 }));

await check('typing in A appears in B', async () => {
  await A.click('.monaco-editor .view-lines');
  await A.keyboard.press('Control+End');
  await A.keyboard.type('\n# typed by Akshit', { delay: 20 });
  await waitText(B, `t.includes('# typed by Akshit')`, 'B sees A typing');
});

await check('typing in B appears in A', async () => {
  await B.click('.monaco-editor .view-lines');
  await B.keyboard.press('Control+End');
  await B.keyboard.type('\n# typed by Miti', { delay: 20 });
  await waitText(A, `t.includes('# typed by Miti')`, 'A sees B typing');
});

await check('simultaneous typing: no lost characters, both converge', async () => {
  await Promise.all([
    (async () => {
      await A.keyboard.press('Control+End');
      await A.keyboard.type('\nAAAAAAAA', { delay: 15 });
    })(),
    (async () => {
      await B.keyboard.press('Control+Home');
      await B.keyboard.type('BBBBBBBB\n', { delay: 15 });
    })(),
  ]);
  await waitText(A, `t.includes('AAAAAAAA') && t.includes('BBBBBBBB')`, 'A has both');
  await waitText(B, `t.includes('AAAAAAAA') && t.includes('BBBBBBBB')`, 'B has both');
  if ((await textOf(A)) !== (await textOf(B))) throw new Error('diverged');
});

// ---- P-A3: presence and cursors -------------------------------------------------------------------------
await check('presence: each tab lists both people, me marked (you)', async () => {
  await A.waitForSelector('[data-presence^="Miti:"]', { timeout: 6000 });
  await B.waitForSelector('[data-presence^="Akshit:"]', { timeout: 6000 });
  const strip = await A.textContent('[data-testid="presence-strip"]');
  if (!strip.includes('Akshit (you)')) throw new Error('missing "(you)": ' + strip);
});

await check('presence: typing shows as "typing" for others, then returns to online', async () => {
  await B.click('.monaco-editor .view-lines');
  await B.keyboard.type('zzz', { delay: 30 });
  await A.waitForSelector('[data-presence="Miti:typing"]', { timeout: 4000 });
  await A.waitForSelector('[data-presence="Miti:online"]', { timeout: 6000 });
});

await check('remote cursor carries a name label (styled from awareness)', async () => {
  await B.keyboard.type('q', { delay: 30 });
  await A.waitForSelector('.yRemoteSelectionHead', { timeout: 4000 });
  const content = await A.evaluate(() => getComputedStyle(document.querySelector('.yRemoteSelectionHead'), '::before').content);
  if (!content.includes('Miti')) throw new Error('label content was ' + content);
});

await check('usePresence() feeds other lanes (Debug panel stub lists the people)', async () => {
  await A.waitForFunction(() => document.body.textContent.includes('people in room: Akshit, Miti'), null, { timeout: 4000 });
});

await check('EditorHandle.replaceAll in A reaches B, no leftovers', async () => {
  await A.evaluate(() => window.__sv.editor.replaceAll('print("patched")\n'));
  await waitText(B, `t === 'print("patched")\\n'`, 'B sees exactly the replacement');
});

await check('EditorHandle.setMarkers + highlightLine draw', async () => {
  await A.evaluate(() => window.__sv.editor.replaceAll('a = 1\nb = 2\nc = a + d\n'));
  await A.evaluate(() => {
    window.__sv.editor.setMarkers([{ line: 3, message: 'NameError: d', severity: 'error' }]);
    window.__sv.editor.highlightLine(3);
  });
  await A.waitForSelector('.sv-error-line', { timeout: 4000 });
  await A.waitForSelector('.squiggly-error', { timeout: 4000 });
  await A.evaluate(() => window.__sv.editor.highlightLine(null));
});

await check('refreshing a tab keeps the code (room persists on the server)', async () => {
  await B.reload();
  await B.waitForSelector('.monaco-editor', { timeout: 20000 });
  await waitText(B, `t.includes('c = a + d')`, 'B after reload');
});

await check('presence: a person who closes the tab disappears for others', async () => {
  await B.context().close();
  await A.waitForFunction(() => !document.querySelector('[data-presence^="Miti:"]'), null, { timeout: 8000 });
});

await browser.close();
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
