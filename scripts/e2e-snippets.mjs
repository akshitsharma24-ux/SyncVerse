// Editor snippets and completion, in real browsers. Needs the dev servers running:  npm run dev   then   npm run e2e:snippets
// Checks the VS Code-style behaviour: type a prefix (Java: sout) and press Tab, jump between blanks with Tab, members after a dot,
// the java.util import that comes with a class, Enter staying a plain new line, and that an expansion reaches the other person.
// Owner: Lane A.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const room = 'snip-' + Math.random().toString(36).slice(2, 7);
const results = [];
const check = async (name, fn) => {
  try {
    const d = await fn();
    results.push([true, name, d ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const expectEq = (got, want, what) => {
  if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const mk = async (name, role = 'student') => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await page.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await page.waitForSelector('.monaco-editor', { timeout: 20000 });
  await page.waitForFunction(() => window.__sv?.editor && window.__sv.files.list().length > 0, null, { timeout: 10000 });
  return page;
};

const A = await mk('Akshit');
const B = await mk('Miti', 'mentor');
const value = (p) => p.evaluate(() => window.__sv.editor.getValue());
const widget = (p) => p.locator('.suggest-widget.visible');

/** Empty the open file and put the cursor in it, ready for typing. */
async function reset(p, text = '') {
  await p.keyboard.press('Escape'); // leave any snippet session / list from the previous check
  await p.keyboard.press('Escape');
  await p.evaluate((t) => window.__sv.editor.replaceAll(t), text);
  await p.click('.monaco-editor .view-lines');
  await p.keyboard.press('Control+End');
}
async function openFile(p, name) {
  const existing = await p.evaluate((n) => window.__sv.files.list().find((f) => f.name === n)?.id ?? null, name);
  if (existing) await p.evaluate((id) => window.__sv.files.select(id), existing);
  else {
    const err = await p.evaluate((n) => window.__sv.files.create(n), name);
    if (err) throw new Error('could not create ' + name + ': ' + err);
  }
  await p.waitForFunction((n) => window.__sv.files.list().find((f) => f.name === n)?.id === window.__sv.files.activeId(), name, { timeout: 5000 });
}

await openFile(A, 'Main.java');

await check('Java: sout + Tab gives System.out.println(|) with the cursor inside the brackets', async () => {
  await reset(A);
  await A.keyboard.type('sout', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('"Hi"');
  expectEq(await value(A), 'System.out.println("Hi");', 'text');
});

await check('Java: for gives the counting loop, foreach the collection loop, if gives a plain if', async () => {
  for (const [typed, start] of [['for', 'for (int i = 0; i < n; i++) {'], ['foreach', 'for (String item : items) {'], ['if', 'if (condition) {']]) {
    await reset(A);
    await A.keyboard.type(typed, { delay: 60 });
    await widget(A).waitFor({ timeout: 4000 });
    await A.keyboard.press('Tab');
    const v = await value(A);
    if (!v.startsWith(start)) throw new Error(`${typed}: got ${JSON.stringify(v)}`);
  }
});

await check('Java: fori expands, renaming i renames all three, Tab jumps to the next blank', async () => {
  await reset(A);
  await A.keyboard.type('fori', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('k'); // replaces the selected placeholder i and its mirrors
  await A.keyboard.press('Tab');
  await A.keyboard.type('10');
  const v = await value(A);
  if (!v.startsWith('for (int k = 0; k < 10; k++) {')) throw new Error('got ' + JSON.stringify(v));
});

await check('Java: main / psvm expand to a main method', async () => {
  await reset(A);
  await A.keyboard.type('psvm', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  const v = await value(A);
  if (!v.startsWith('public static void main(String[] args) {')) throw new Error('got ' + JSON.stringify(v));
});

await check('Java: System.out. lists println and Tab completes it with brackets', async () => {
  await reset(A);
  await A.keyboard.type('System.out.', { delay: 40 });
  await widget(A).waitFor({ timeout: 4000 });
  const shown = await A.locator('.suggest-widget.visible .monaco-list-row').allInnerTexts();
  if (!shown.some((t) => t.includes('println')) || !shown.some((t) => t.includes('printf'))) throw new Error('members missing: ' + shown.join(' | '));
  await A.keyboard.type('printl', { delay: 40 });
  await A.keyboard.press('Tab');
  expectEq(await value(A), 'System.out.println()', 'text');
});

await check('Java: picking Scanner adds "import java.util.Scanner;" (even on line 1 of an empty file)', async () => {
  await reset(A);
  await A.keyboard.type('Scann', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  const v = await value(A);
  if (!v.includes('import java.util.Scanner;') || !/\nScanner$/.test(v.trimEnd())) throw new Error('got ' + JSON.stringify(v));
});

await check('Java: no second import when it is already there', async () => {
  await reset(A, 'import java.util.Scanner;\n\nclass A {\n    void f() {\n        \n    }\n}\n');
  await A.keyboard.press('Control+Home'); // then down to the empty line inside f()
  for (let i = 0; i < 4; i++) await A.keyboard.press('ArrowDown');
  await A.keyboard.press('End');
  await A.keyboard.type('Scann', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  const v = await value(A);
  expectEq((v.match(/import java\.util\.Scanner;/g) || []).length, 1, 'number of imports');
});

await check('Enter never accepts a suggestion: it is always a new line', async () => {
  await reset(A);
  await A.keyboard.type('sout', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Enter');
  expectEq(await value(A), 'sout\n', 'text');
});

await check('words already in the file are offered (a variable you made)', async () => {
  await reset(A, 'int totalScore = 5;\nSystem.out.println(tota');
  await A.keyboard.press('Control+End');
  await A.keyboard.type('l', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  const shown = await A.locator('.suggest-widget.visible .monaco-list-row').allInnerTexts();
  if (!shown.some((t) => t.includes('totalScore'))) throw new Error('not offered: ' + shown.join(' | '));
});

// ---- Python -----------------------------------------------------------------------------------------------------------------
await openFile(A, 'main.py');

await check('Python: fori + Tab gives a range loop, then main/ifmain gives the __main__ guard', async () => {
  await reset(A);
  await A.keyboard.type('fori', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('n');
  const v = await value(A);
  if (!/^for n in range\(n\):\n\s+pass/.test(v)) throw new Error('got ' + JSON.stringify(v));
  await reset(A);
  await A.keyboard.type('ifmain', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  if (!(await value(A)).startsWith('if __name__ == "__main__":')) throw new Error('ifmain: ' + JSON.stringify(await value(A)));
});

await check('Python: print is offered as a function and Tab gives print(|)', async () => {
  await reset(A);
  await A.keyboard.type('prin', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('"x"');
  expectEq(await value(A), 'print("x")', 'text');
});

await check('Python: typing a colon at the end of a line does not pop up a list', async () => {
  await reset(A);
  await A.keyboard.type('if x:', { delay: 60 });
  await A.waitForTimeout(700);
  if (await widget(A).count()) throw new Error('a suggestion list opened after ":"');
});

await check('Python: math. lists sqrt', async () => {
  await reset(A);
  await A.keyboard.type('math.', { delay: 50 });
  await widget(A).waitFor({ timeout: 4000 });
  const shown = await A.locator('.suggest-widget.visible .monaco-list-row').allInnerTexts();
  if (!shown.some((t) => t.includes('sqrt'))) throw new Error(shown.join(' | '));
});

// ---- other languages ----------------------------------------------------------------------------------------------------------
await openFile(A, 'app.js');
await check('JavaScript: log + Tab gives console.log(|)', async () => {
  await reset(A);
  await A.keyboard.type('log', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('1');
  expectEq(await value(A), 'console.log(1);', 'text');
});

await openFile(A, 'prog.cpp');
await check('C++: cout + Tab gives std::cout << | << std::endl;', async () => {
  await reset(A);
  await A.keyboard.type('cout', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('"a"');
  expectEq(await value(A), 'std::cout << "a" << std::endl;', 'text');
});

await openFile(A, 'prog.c');
await check('C: printf + Tab gives printf("|\\n");  and #include is not typed twice', async () => {
  await reset(A);
  await A.keyboard.type('printf', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('hi');
  expectEq(await value(A), 'printf("hi\\n");', 'text');
  await reset(A);
  await A.keyboard.type('#inc', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  const v = await value(A);
  if (!v.startsWith('#include <stdio.h>')) throw new Error('got ' + JSON.stringify(v));
});

// ---- the other person ----------------------------------------------------------------------------------------------------------
await check('an expanded snippet reaches the other browser like any edit', async () => {
  await openFile(A, 'Main.java');
  await reset(A);
  await A.keyboard.type('sout', { delay: 60 });
  await widget(A).waitFor({ timeout: 4000 });
  await A.keyboard.press('Tab');
  await A.keyboard.type('"shared"');
  await openFile(B, 'Main.java');
  await B.waitForFunction(() => window.__sv.editor.getValue() === 'System.out.println("shared");', null, { timeout: 8000 });
});

await browser.close();
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
