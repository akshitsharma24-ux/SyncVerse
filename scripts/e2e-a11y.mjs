// Accessibility check with axe-core (WCAG 2.0/2.1 A + AA) on the entry page and every workspace screen of the dark Quiet Studio frontend.
// Needs the dev servers running:  npm run dev   then   npm run e2e:a11y
// Fails on serious/critical violations; moderate/minor ones are listed but do not fail. Monaco's internals are excluded.
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
let failing = 0;

async function suite(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
  const page = await ctx.newPage();

  async function audit(label) {
    await page.addScriptTag({ path: axePath });
    const res = await page.evaluate(
      (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, exclude: [['.monaco-editor']] }),
      TAGS,
    );
    const hard = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    const soft = res.violations.filter((v) => !['serious', 'critical'].includes(v.impact));
    console.log(`${hard.length ? 'FAIL' : 'PASS'}  [${theme}] ${label}  (${res.passes.length} rules passed, ${hard.length} serious/critical, ${soft.length} minor)`);
    for (const v of [...hard, ...soft]) {
      console.log(`        [${v.impact}] ${v.id}: ${v.help}  x${v.nodes.length}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`            ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n').slice(1, 2).join(' ').trim().slice(0, 140)}`);
    }
    if (hard.length) failing++;
  }

  await page.goto(BASE);
  await page.waitForSelector('[data-testid="hero-create"]');
  const applied = await page.getAttribute('html', 'data-theme');
  if (applied !== theme) throw new Error(`expected data-theme=${theme}, page has ${applied}`);
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('revealed'))); // scroll-reveal sections
  await page.waitForTimeout(500);
  await audit('landing page');
  await page.click('[data-testid="hero-create"]');
  await audit('entry dialog, Create mode');
  await page.keyboard.press('Escape');
  await page.click('[data-testid="hero-join"]');
  await audit('entry dialog, Join mode');
  await page.keyboard.press('Escape');

  // Sign-in dialog (both modes) and, after creating a throw-away account, the profile dialog.
  await page.click('[data-testid="auth-open"]');
  await audit('sign-in dialog');
  await page.click('[data-testid="auth-mode-register"]');
  await audit('create-account dialog');
  await page.fill('[data-testid="auth-username"]', 'axe' + Math.random().toString(36).slice(2, 8));
  await page.fill('[data-testid="auth-password"]', 'axe test pass 77');
  await page.click('[data-testid="auth-submit"]');
  await page.waitForSelector('[data-testid="profile-open"]');
  await page.click('[data-testid="profile-open"]');
  await audit('profile dialog');
  await page.keyboard.press('Escape');
  await page.click('[data-testid="profile-open"]');
  await page.click('[data-testid="profile-signout"]');

  await page.goto(`${BASE}/?name=Axe&role=student&room=a11y-${theme}-${Math.random().toString(36).slice(2, 6)}`);
  await page.waitForSelector('.monaco-editor');
  await page.waitForFunction(() => document.body.innerText.includes('live'));
  for (const tab of ['Video', 'AI', 'Quality', 'Debug', 'Progress', 'Board']) {
    await openTool(page, tab);
    await audit(`workspace, ${tab} tab`);
  }
  await page.click('[data-testid="board-expand"]'); // the Whiteboard tool is open now
  await audit('whiteboard, large view');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Show sidebar', exact: true }).click();
  await audit('workspace, sidebar open');
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  await page.click('[data-testid="status-chip"]');
  await audit('workspace, status popover open');
  await page.keyboard.press('Escape');
  await page.click('[data-testid="file-new"]');
  await audit('workspace, new-file form open');
  await page.keyboard.press('Escape');
  await page.click('[data-testid="room-open"]');
  await audit('room drawer, People');
  for (const t of ['history', 'settings']) {
    await page.click(`[data-testid="room-tab-${t}"]`);
    await audit(`room drawer, ${t}`);
  }
  await page.keyboard.press('Escape');
  await page.click('[data-testid="file-delete"]').catch(() => {}); // disabled with one file: nothing to audit
  await page.click('[data-testid="file-new"]');
  await page.fill('[data-testid="file-new-name"]', 'second.py');
  await page.click('[data-testid="file-new-submit"]');
  await page.click('[data-testid="file-delete"]');
  await audit('delete-file confirmation');
  await page.keyboard.press('Escape');
  await ctx.close();
}

await suite('dark'); // Quiet Studio has one theme

await browser.close();
process.exit(failing ? 1 : 0);
