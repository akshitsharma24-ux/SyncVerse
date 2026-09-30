// Accessibility check with axe-core (WCAG 2.0/2.1 A + AA) on the entry page and every workspace tab.
// Needs the dev servers running:  npm run dev   then   npm run e2e:a11y
// Fails on serious/critical violations; moderate/minor ones are listed but do not fail. Monaco's internals are excluded.
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();

let failing = 0;
async function audit(label) {
  await page.addScriptTag({ path: axePath });
  const res = await page.evaluate(
    (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, exclude: [['.monaco-editor']] }),
    TAGS,
  );
  const hard = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  const soft = res.violations.filter((v) => !['serious', 'critical'].includes(v.impact));
  console.log(`${hard.length ? 'FAIL' : 'PASS'}  ${label}  (${res.passes.length} rules passed, ${hard.length} serious/critical, ${soft.length} minor)`);
  for (const v of [...hard, ...soft]) {
    console.log(`        [${v.impact}] ${v.id}: ${v.help}  x${v.nodes.length}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`            ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n').slice(1, 2).join(' ').trim().slice(0, 130)}`);
  }
  if (hard.length) failing++;
}

await page.goto(BASE);
await page.waitForSelector('h1.headline');
await audit('entry page, Create mode');
await page.getByRole('button', { name: 'Join a room' }).first().click();
await audit('entry page, Join mode');

await page.goto(`${BASE}/?name=Axe&role=student&room=a11y-${Math.random().toString(36).slice(2, 6)}`);
await page.waitForSelector('.monaco-editor');
await page.waitForFunction(() => document.body.innerText.includes('live'));
for (const tab of ['Video', 'AI', 'Quality', 'Debug', 'Progress']) {
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await audit(`workspace, ${tab} tab`);
}
await page.click('[data-testid="status-chip"]');
await audit('workspace, status popover open');

await browser.close();
process.exit(failing ? 1 : 0);
