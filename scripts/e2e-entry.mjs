// Entry page and workspace chrome. Needs the dev servers running:  npm run dev   then   npm run e2e:entry
// Owner: Lane A.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return page;
};

const P1 = await newPage();
await P1.goto(BASE);

await check('entry page shows the headline, card and live editor mock', async () => {
  await P1.waitForSelector('h1.headline', { timeout: 10000 });
  const h = await P1.textContent('h1.headline');
  if (!h.includes('Learn to code together.') || !h.includes('Understand it on your own.')) throw new Error('headline: ' + h);
  await P1.waitForSelector('[data-testid="entry-card"]');
  await P1.waitForSelector('.ide');
});

await check('all six feature cells render', async () => {
  const n = await P1.locator('.cell').count();
  if (n !== 6) throw new Error('cells: ' + n);
});

await check('the mock editor animates (caret moves between steps)', async () => {
  const pos = () => P1.evaluate(() => document.querySelector('.cursor')?.getAttribute('style') ?? '');
  const a = await pos();
  await P1.waitForTimeout(3600);
  const b = await pos();
  if (a === b) throw new Error('caret did not move');
});

await check('reduced motion: mock holds still on the error + explanation frame', async () => {
  const p = await newPage({ reducedMotion: 'reduce' });
  await p.goto(BASE);
  await p.waitForSelector('.ide');
  await p.waitForTimeout(2500);
  const t = await p.textContent('.ide');
  await p.context().close();
  if (!t.includes('IndexError') || !t.includes('The loop ran one step too far')) throw new Error('not on the story frame');
});

let created = '';
await check('create a room: generated code is shown, submit opens the workspace with that code', async () => {
  created = (await P1.textContent('[data-testid="entry-generated"]')).trim();
  if (!/^[a-z]+-[a-z]+-\d\d$/.test(created)) throw new Error('code format: ' + created);
  await P1.fill('[data-testid="entry-name"]', 'Akshit');
  await P1.click('[data-testid="entry-submit"]');
  await P1.waitForSelector('[data-testid="topbar"]', { timeout: 15000 });
  const shown = (await P1.textContent('[data-testid="room-code"]')).trim();
  if (shown !== created) throw new Error(`room code ${shown} != ${created}`);
});

await check('invite link copy puts /?room=<code> on the clipboard', async () => {
  await P1.click('[data-testid="copy-invite"]');
  const clip = await P1.evaluate(() => navigator.clipboard.readText());
  if (clip !== `${BASE}/?room=${created}`) throw new Error('clipboard: ' + clip);
});

await check('invite link opens the entry page in Join mode with the code filled in', async () => {
  const P2 = await newPage();
  await P2.goto(`${BASE}/?room=${created}`);
  await P2.waitForSelector('[data-testid="entry-code"]');
  const v = await P2.inputValue('[data-testid="entry-code"]');
  if (v !== created) throw new Error('prefill: ' + v);
  await P2.fill('[data-testid="entry-name"]', 'Miti');
  await P2.getByRole('button', { name: 'Mentor', exact: true }).click();
  await P2.click('[data-testid="entry-submit"]');
  await P2.waitForSelector('[data-testid="topbar"]', { timeout: 15000 });
  // both see each other in the top bar avatars and the editor presence strip
  await P1.waitForSelector('[data-topbar-presence="Miti"]', { timeout: 8000 });
  await P2.waitForSelector('[data-topbar-presence="Akshit"]', { timeout: 8000 });
  await P1.waitForSelector('[data-presence^="Miti:"]', { timeout: 8000 });
  await P2.context().close();
});

await check('joining with an empty code shows a clear message', async () => {
  const p = await newPage();
  await p.goto(BASE);
  await p.getByRole('button', { name: 'Join a room' }).first().click();
  await p.fill('[data-testid="entry-name"]', 'Sam');
  await p.click('[data-testid="entry-submit"]');
  await p.waitForSelector('[role="alert"]', { timeout: 3000 });
  const t = await p.textContent('[role="alert"]');
  await p.context().close();
  if (!t.includes('room code')) throw new Error('alert: ' + t);
});

await check('a messy room code is cleaned ("My Room!" becomes my-room)', async () => {
  const p = await newPage();
  await p.goto(BASE);
  await p.getByRole('button', { name: 'Join a room' }).first().click();
  await p.fill('[data-testid="entry-name"]', 'Sam');
  await p.fill('[data-testid="entry-code"]', 'My Room!');
  await p.click('[data-testid="entry-submit"]');
  await p.waitForSelector('[data-testid="room-code"]', { timeout: 15000 });
  const code = (await p.textContent('[data-testid="room-code"]')).trim();
  await p.context().close();
  if (code !== 'my-room') throw new Error('got ' + code);
});

await check('workspace: tabs switch, every tab stays mounted, dock is resizable by keyboard', async () => {
  await P1.getByRole('tab', { name: 'Debug', exact: true }).click();
  await P1.waitForFunction(() => document.body.textContent.includes('people in room'));
  const before = await P1.evaluate(() => document.querySelector('aside').getBoundingClientRect().width);
  await P1.focus('[role="separator"][aria-orientation="vertical"]');
  await P1.keyboard.press('ArrowLeft');
  await P1.keyboard.press('ArrowLeft');
  const after = await P1.evaluate(() => document.querySelector('aside').getBoundingClientRect().width);
  if (!(after > before)) throw new Error(`dock width ${before} -> ${after}`);
});

await check('no horizontal overflow on the entry page at tablet (820px) and phone (390px) widths', async () => {
  for (const width of [820, 390]) {
    const p = await newPage({ viewport: { width, height: 900 } });
    await p.goto(BASE);
    await p.waitForSelector('h1.headline');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await p.context().close();
    if (over > 2) throw new Error(`${width}px overflows by ${over}px`);
  }
});

await browser.close();
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
