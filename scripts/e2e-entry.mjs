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

await check('status chip reports the services and opens a readable list', async () => {
  await P1.waitForSelector('[data-testid="status-chip"]:not([data-state="checking"])', { timeout: 8000 });
  const state = await P1.getAttribute('[data-testid="status-chip"]', 'data-state');
  if (!['ok', 'setup'].includes(state)) throw new Error('unexpected state ' + state);
  await P1.click('[data-testid="status-chip"]');
  await P1.waitForSelector('[data-testid="status-popover"]', { timeout: 3000 });
  const rows = await P1.locator('[data-status-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status-row')));
  for (const r of ['Server', 'Code runner', 'AI tutor', 'Video']) if (!rows.includes(r)) throw new Error('missing row ' + r);
  await P1.keyboard.press('Escape');
  await P1.waitForSelector('[data-testid="status-popover"]', { state: 'detached', timeout: 3000 });
  return state;
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
  // toasts last ~4 s: start listening BEFORE Miti joins so the test cannot miss it
  // people who arrive within ~1.5 s of your own arrival are not announced (you are just meeting the room), so let the room settle first
  await P1.waitForTimeout(2200);
  const sawJoin = P1.waitForSelector('[data-testid="toast"]:has-text("Miti joined")', { timeout: 20000 }).then(() => true, () => false);
  await P2.click('[data-testid="entry-submit"]');
  await P2.waitForSelector('[data-testid="topbar"]', { timeout: 15000 });
  // both see each other in the top bar avatars and the editor presence strip
  await P1.waitForSelector('[data-topbar-presence="Miti"]', { timeout: 8000 });
  await P2.waitForSelector('[data-topbar-presence="Akshit"]', { timeout: 8000 });
  await P1.waitForSelector('[data-presence^="Miti:"]', { timeout: 8000 });
  if (!(await sawJoin)) {
    const seen = await P1.evaluate(() => ({ toasts: [...document.querySelectorAll('[data-testid="toast"]')].map((t) => t.textContent), people: [...document.querySelectorAll('[data-topbar-presence]')].map((p) => p.getAttribute('data-topbar-presence')), url: location.href }));
    throw new Error('no "Miti joined" toast on the other tab; P1 sees ' + JSON.stringify(seen));
  }
  const sawLeft = P1.waitForSelector('[data-testid="toast"]:has-text("Miti left")', { timeout: 20000 }).then(() => true, () => false);
  await P2.context().close();
  if (!(await sawLeft)) throw new Error('no "Miti left" toast on the other tab');
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
  await P1.waitForSelector('[data-testid="debug-panel"]', { state: 'visible', timeout: 8000 });
  const before = await P1.evaluate(() => document.querySelector('aside').getBoundingClientRect().width);
  await P1.focus('[role="separator"][aria-orientation="vertical"]');
  await P1.keyboard.press('ArrowLeft');
  await P1.keyboard.press('ArrowLeft');
  const after = await P1.evaluate(() => document.querySelector('aside').getBoundingClientRect().width);
  if (!(after > before)) throw new Error(`dock width ${before} -> ${after}`);
});

await check('keyboard: the first Tab stop is a skip link that jumps to the editor; tabs move with arrow keys', async () => {
  const p = await newPage();
  await p.goto(`${BASE}/?name=Kay&role=student&room=kb-${Math.random().toString(36).slice(2, 6)}`);
  await p.waitForSelector('.monaco-editor', { timeout: 20000 });
  await p.keyboard.press('Tab');
  const first = await p.evaluate(() => document.activeElement?.textContent?.trim());
  if (first !== 'Skip to the editor') throw new Error('first focus was ' + JSON.stringify(first));
  await p.keyboard.press('Enter');
  const target = await p.evaluate(() => document.activeElement?.id);
  if (target !== 'editor-region') throw new Error('skip link landed on ' + target);
  if ((await p.locator('main').count()) !== 1) throw new Error('expected exactly one main landmark');
  // tabs: roving focus with arrows, Home / End
  await p.getByRole('tab', { name: 'AI', exact: true }).focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => document.activeElement?.id === 'tab-quality' && document.activeElement.getAttribute('aria-selected') === 'true');
  await p.keyboard.press('End');
  await p.waitForFunction(() => document.activeElement?.id === 'tab-progress');
  await p.keyboard.press('Home');
  await p.waitForFunction(() => document.activeElement?.id === 'tab-video');
  await p.keyboard.press('ArrowLeft');
  await p.waitForFunction(() => document.activeElement?.id === 'tab-progress');
  // the selected tab controls a labelled panel
  const ok = await p.evaluate(() => {
    const t = document.querySelector('[role="tab"][aria-selected="true"]');
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    return panel?.getAttribute('aria-labelledby') === t.id;
  });
  await p.context().close();
  if (!ok) throw new Error('tab and panel are not linked');
});

await check('theme: first visit follows the system, the toggle switches it, the choice is remembered, and the editor follows', async () => {
  const lum = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
  const p = await newPage({ colorScheme: 'dark' });
  await p.goto(BASE);
  await p.waitForSelector('h1.headline');
  const html = () => p.getAttribute('html', 'data-theme');
  const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if ((await html()) !== 'dark') throw new Error('an OS set to dark did not open dark: ' + (await html()));
  if (lum(await bg()) > 150) throw new Error('dark theme has a light page background: ' + (await bg()));
  await p.click('[data-testid="theme-toggle"]');
  if ((await html()) !== 'light' || lum(await bg()) < 500) throw new Error('toggle did not switch to light');
  await p.reload();
  await p.waitForSelector('h1.headline');
  if ((await html()) !== 'light') throw new Error('the choice was not remembered: a reload went back to ' + (await html()) + ' (the OS is dark)');
  await p.click('[data-testid="theme-toggle"]');
  if ((await html()) !== 'dark') throw new Error('toggle did not switch back to dark');
  // the editor follows the theme, in the workspace too
  await p.goto(`${BASE}/?name=Dee&role=student&room=theme-${Math.random().toString(36).slice(2, 6)}`);
  await p.waitForSelector('.monaco-editor', { timeout: 20000 });
  if (!(await p.evaluate(() => document.querySelector('.monaco-editor').classList.contains('vs-dark')))) throw new Error('editor is not dark in dark mode');
  await p.click('[data-testid="theme-toggle"]');
  await p.waitForFunction(() => !document.querySelector('.monaco-editor').classList.contains('vs-dark'), null, { timeout: 4000 });
  await p.context().close();
});

await check('a crashing panel is contained: only that panel shows an error card, the rest keeps working', async () => {
  const p = await newPage();
  await p.goto(`${BASE}/?name=Crash&role=student&room=crash-${Math.random().toString(36).slice(2, 6)}&crash=ai`);
  await p.waitForSelector('.monaco-editor', { timeout: 20000 });
  await p.getByRole('tab', { name: 'AI', exact: true }).click();
  await p.waitForSelector('[data-testid="panel-crash"][data-panel="ai"]', { timeout: 5000 });
  // editor still live and typable, other tabs still render, top bar still there
  await p.waitForFunction(() => document.body.innerText.includes('live'), null, { timeout: 8000 });
  await p.evaluate(() => window.__sv.editor.replaceAll('still_works = 1\n'));
  if ((await p.evaluate(() => window.__sv.editor.getValue())) !== 'still_works = 1\n') throw new Error('editor broke');
  await p.getByRole('tab', { name: 'Quality', exact: true }).click();
  await p.waitForFunction(() => document.body.textContent.includes('Code quality'));
  await p.waitForSelector('[data-testid="topbar"]');
  const crashes = await p.locator('[data-testid="panel-crash"]').count();
  await p.context().close();
  if (crashes !== 1) throw new Error('expected exactly 1 crashed panel, got ' + crashes);
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







