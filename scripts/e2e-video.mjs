// Video dock checks. Needs the dev servers running:  npm run dev   then   npm run e2e:video
// Without LiveKit keys in .env it verifies the friendly "not configured" path; with keys it also checks the call UI mounts.
// Real media between two people can only be checked by hand on two devices (headless browsers have no camera).
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const health = await (await fetch((process.env.SMOKE_BASE ?? 'http://localhost:4000') + '/api/health')).json();
const configured = health.configured?.livekit === true;
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?name=Akshit&role=student&room=e2e-video`);
await page.waitForSelector('.monaco-editor', { timeout: 20000 });

await check('Video tab shows the Join call button (no auto-connect)', async () => {
  await openTool(page, 'Video');
  await page.waitForSelector('[data-testid="video-join"]', { timeout: 4000 });
  if (await page.$('[data-testid="video-live"]')) throw new Error('connected without a click');
});

if (!configured) {
  await check('without keys: clicking Join shows the setup hint, not a crash', async () => {
    await page.click('[data-testid="video-join"]');
    await page.waitForSelector('[data-testid="video-error"]', { timeout: 6000 });
    const t = await page.textContent('[data-testid="video-error"]');
    if (!t.includes('LIVEKIT_URL')) throw new Error('hint missing: ' + t);
  });
} else {
  await check('with keys: clicking Join mounts the LiveKit room UI', async () => {
    await page.click('[data-testid="video-join"]');
    await page.waitForSelector('[data-testid="video-live"]', { timeout: 10000 });
  });
}

await browser.close();
console.log(`(livekit configured on server: ${configured})`);
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.every((r) => r[0]) ? 0 : 1);

