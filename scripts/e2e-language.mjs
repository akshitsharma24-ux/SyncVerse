// Changing the language, in real browsers. Needs the dev servers running:  npm run dev   then   npm run e2e:language
// Picking a language in the console or in the file bar must visibly change something: the file's colours and, while the file is
// still a starter, its code and default name (main.py -> Main.java). Code a person wrote is never replaced. Owner: Lane A.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const room = 'lang-' + Math.random().toString(36).slice(2, 7);
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (got, want, what) => {
  if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const mk = async (name) => {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 860 } })).newPage();
  p.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await p.goto(`${BASE}/?name=${name}&role=student&room=${room}`);
  await p.waitForSelector('.monaco-editor', { timeout: 20000 });
  await p.waitForFunction(() => window.__sv?.files.list().length > 0);
  return p;
};
const A = await mk('Ana');
const B = await mk('Ben');
const state = (p) => p.evaluate(() => ({ file: window.__sv.files.list()[0].name, lang: window.__sv.files.list()[0].language, text: window.__sv.editor.getValue() }));
const waitFile = (p, name) => p.waitForFunction((n) => window.__sv.files.list()[0].name === n, name, { timeout: 8000 });

await check('the console language menu switches an untouched file: new colours, its starter code and its default name', async () => {
  await A.locator('[data-testid="run-language"]').selectOption('java');
  await waitFile(A, 'Main.java');
  const s = await state(A);
  eq(s.lang, 'java', 'file language');
  if (!s.text.startsWith('public class Main')) throw new Error('code was not swapped: ' + JSON.stringify(s.text.slice(0, 40)));
  eq(await A.evaluate(() => window.__sv.files.activeLanguage()), 'java', 'editor language');
});

await check('the other person sees the switch', async () => {
  await waitFile(B, 'Main.java');
  await B.waitForFunction(() => window.__sv.editor.getValue().startsWith('public class Main'), null, { timeout: 8000 });
});

await check('the file bar language menu does the same, in both directions', async () => {
  await A.locator('[data-testid="file-language"]').selectOption('cpp');
  await waitFile(A, 'main.cpp');
  if (!(await state(A)).text.includes('#include <iostream>')) throw new Error('C++ starter missing');
  await A.locator('[data-testid="file-language"]').selectOption('python');
  await waitFile(A, 'main.py');
  if (!(await state(A)).text.includes('print("Hello, SyncVerse!")')) throw new Error('Python starter missing');
  eq(await A.locator('[data-testid="run-language"]').inputValue(), 'python', 'the console follows');
});

await check('the room\'s first program counts as a starter too (a fresh room switched to Java shows Java)', async () => {
  const C = await (await browser.newContext({ viewport: { width: 1400, height: 860 } })).newPage(); // a new room, still on the planted IndexError program
  await C.goto(`${BASE}/?name=Cy&role=student&room=${room}-fresh`);
  await C.waitForSelector('.monaco-editor', { timeout: 20000 });
  await C.waitForFunction(() => window.__sv?.editor.getValue().includes('def average(nums)'), null, { timeout: 15000 });
  await C.locator('[data-testid="run-language"]').selectOption('java');
  await waitFile(C, 'Main.java');
  if (!(await state(C)).text.startsWith('public class Main')) throw new Error('first program was not swapped');
  await C.context().close();
});

await check('code a person wrote or loaded is never replaced; only the language changes', async () => {
  await A.evaluate(() => window.__sv.editor.replaceAll('print("my own work")\n'));
  await A.locator('[data-testid="run-language"]').selectOption('java');
  await A.waitForFunction(() => window.__sv.files.list()[0].language === 'java', null, { timeout: 8000 });
  const s = await state(A);
  eq(s.text, 'print("my own work")\n', 'code');
  eq(s.file, 'main.py', 'name');
});

await check('a viewer cannot switch the shared file (only their own run language changes)', async () => {
  const V = await (await browser.newContext({ viewport: { width: 1400, height: 860 } })).newPage();
  await V.goto(`${BASE}/?name=Vik&role=viewer&room=${room}`);
  await V.waitForSelector('.monaco-editor', { timeout: 20000 });
  await V.waitForFunction(() => window.__sv?.files.list().length > 0);
  const before = await state(V);
  await V.locator('[data-testid="run-language"]').selectOption('c').catch(() => {});
  await V.waitForTimeout(700);
  const after = await state(V);
  eq(after.lang, before.lang, 'file language');
  eq(after.file, before.file, 'file name');
  await V.context().close();
});

await browser.close();
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
