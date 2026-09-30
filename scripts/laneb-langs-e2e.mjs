// Lane B (Simrit) browser checks for P-B5: the language selector, runs in Java / C / JavaScript, and the quality panel
// stepping aside for non-Python code. Needs the dev servers running:  npm run dev     (and internet for Judge0)
//   node scripts/laneb-langs-e2e.mjs        (E2E_SHOTS=<dir> saves a screenshot)
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const SHOTS = process.env.E2E_SHOTS;
const room = 'laneb-l-' + Math.random().toString(36).slice(2, 7);
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

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 860 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const analyzeRequests = [];
page.on('request', (r) => {
  if (r.url().endsWith('/api/analyze')) analyzeRequests.push(Date.now());
});
await page.goto(`${BASE}/?name=Asha&role=student&room=${room}`);
await page.waitForSelector('.monaco-editor', { timeout: 20000 });
await page.waitForFunction(() => window.__sv?.editor.getValue().includes('def average'), null, { timeout: 10000 });
await page.waitForSelector(T('run-language'), { timeout: 10000 });

const setCode = (t) => page.evaluate((x) => window.__sv.editor.replaceAll(x), t);
const runId = () => page.$eval(T('run-status'), (e) => e.dataset.runId).catch(() => null);
async function runAndWait() {
  const before = await runId();
  await page.click(T('run-btn'));
  await page.waitForFunction(
    (b) => {
      const s = document.querySelector('[data-testid=run-status]');
      return s && s.dataset.runId && s.dataset.runId !== b && s.dataset.status !== 'running';
    },
    before,
    { timeout: 45000 },
  );
  return page.$eval(T('run-status'), (e) => e.dataset.status);
}
const stdout = async () => {
  await page.click(T('tab-stdout'));
  return page.$eval(T('run-stdout'), (e) => e.textContent);
};
const pick = (lang) => page.selectOption(T('run-language'), lang);
const squig = (kind) => page.$$eval(`.monaco-editor .squiggly-${kind}`, (e) => e.length);
const highlighted = () =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll('.monaco-editor .view-lines .view-line')];
    return [...document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line')].map((o) => {
      const l = lines.find((x) => x.style.top === o.parentElement.style.top);
      return l ? l.textContent.replace(/ /g, ' ') : null;
    });
  });

await check('the selector offers Python, C, C++, Java and JavaScript and starts on Python', async () => {
  eq(await page.$$eval(`${T('run-language')} option`, (o) => o.map((x) => x.textContent)), ['Python', 'C', 'C++', 'Java', 'JavaScript'], 'options');
  eq(await page.$eval(T('run-language'), (e) => e.value), 'python', 'default');
});

await check('Java: a "public class Foo" program runs (renamed to Main) and the note is shown in the Errors tab', async () => {
  await pick('java');
  await setCode('public class Foo {\n    public static void main(String[] args) {\n        System.out.println("hello from java");\n    }\n}\n');
  eq(await runAndWait(), 'success', 'status');
  eq(await stdout(), 'hello from java\n', 'stdout');
  await page.click(T('tab-stderr'));
  const note = await page.$eval(T('run-stderr'), (e) => e.textContent);
  if (!/renamed to Main/.test(note)) throw new Error(note);
});

await check('the "Running as Java" hint is shown for non-Python languages', async () => {
  const t = await page.$eval(T('run-language-hint'), (e) => e.textContent);
  if (!/Running as Java/.test(t)) throw new Error(t);
});

await check('C: a compile error is marked on the line that lacks the semicolon (line 4), not the next line', async () => {
  await sleep(2200);
  await pick('c');
  await setCode('#include <stdio.h>\n#include <math.h>\nint main(void) {\n    int x = 5\n    printf("%d\\n", x);\n    return 0;\n}\n');
  eq(await runAndWait(), 'compile_error', 'status');
  eq(await page.$eval(T('run-status'), (e) => e.textContent.trim()), 'Compile error', 'badge');
  const row = await page.$eval(T('run-error'), (e) => e.textContent);
  if (!/error: expected/.test(row) || !/line 4/.test(row)) throw new Error('error row: ' + row);
  await page.waitForFunction(() => document.querySelectorAll('.monaco-editor .view-overlays .sv-error-line').length > 0, null, { timeout: 6000 });
  const h = await highlighted();
  if (!h[0] || !h[0].includes('int x = 5')) throw new Error('highlighted: ' + JSON.stringify(h));
  if ((await squig('error')) < 1) throw new Error('no squiggle');
});

await check('C: a segmentation fault shows a plain-language message and no line marker', async () => {
  await sleep(2200);
  await setCode('#include <stdio.h>\nint main(void) {\n    int *p = 0;\n    *p = 1;\n    return 0;\n}\n');
  eq(await runAndWait(), 'runtime_error', 'status');
  const row = await page.$eval(T('run-error'), (e) => e.textContent);
  if (!/Segmentation fault/.test(row)) throw new Error(row);
  if (await page.$(T('run-error-line'))) throw new Error('there should be no line button');
});

await check('the quality panel steps aside for C: clear message, no requests, no lint squiggles', async () => {
  await openTool(page, 'Quality');
  await page.waitForSelector(T('quality-unsupported'), { timeout: 5000 });
  const before = analyzeRequests.length;
  await setCode('int main(void) {\n    int x = 1;\n    return eval(x);\n}\n');
  await sleep(3200); // longer than the 1.5 s debounce
  eq(analyzeRequests.length - before, 0, 'analyze requests while not Python');
  eq(await page.$$eval(T('quality-item'), (e) => e.length), 0, 'findings listed');
  eq(await squig('info') + (await squig('warning')), 0, 'lint squiggles');
});

await check('JavaScript: a ReferenceError is marked on its line (2)', async () => {
  await sleep(1200);
  await pick('javascript');
  await setCode('function f() {\n  console.log(missing);\n}\nf();\n');
  eq(await runAndWait(), 'runtime_error', 'status');
  const row = await page.$eval(T('run-error'), (e) => e.textContent);
  if (!/ReferenceError: missing is not defined/.test(row) || !/line 2/.test(row)) throw new Error(row);
});

await check('the language choice survives a page reload', async () => {
  await page.reload();
  await page.waitForSelector(T('run-language'), { timeout: 15000 });
  eq(await page.$eval(T('run-language'), (e) => e.value), 'javascript', 'language after reload');
});

await check('back to Python: the hint disappears, the quality panel analyses again and finds the eval', async () => {
  await pick('python');
  await setCode('result = eval(input())\n');
  await openTool(page, 'Quality');
  await page.waitForSelector(`${T('quality-item')}[data-rule=dangerous-call]`, { timeout: 9000 });
  eq(await page.$(T('run-language-hint')), null, 'hint gone');
  eq(await page.$(T('quality-unsupported')), null, 'unsupported notice gone');
});

await check('a Python run still works after switching languages back and forth', async () => {
  await sleep(1500);
  await setCode('print("python again")\n');
  eq(await runAndWait(), 'success', 'status');
  eq(await stdout(), 'python again\n', 'stdout');
});

if (SHOTS) {
  await pick('c');
  await setCode('#include <stdio.h>\nint main(void) {\n    printf("hi\\n");\n    return 0;\n}\n');
  await sleep(2200);
  await runAndWait();
  await page.screenshot({ path: `${SHOTS}/langs.png` });
}
await browser.close();

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
