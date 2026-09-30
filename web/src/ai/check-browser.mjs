// Lane C patch workflow in two real browsers. Start npm run dev first.
// Run: node web/src/ai/check-browser.mjs (requires installed Edge or E2E_CHANNEL).
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.E2E_BASE ?? 'http://localhost:5173';
const room = 'lane-c-check-' + Date.now().toString(36);
const source = 'scores = ["4"]\ntotal = scores[0] + 1\nprint(total)';
const fixed = source.replace('scores[0] + 1', 'int(scores[0]) + 1');
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const errors = [];
const textOf = page => page.evaluate(() => window.__sv.editor.getValue());
const waitText = (page, value) => page.waitForFunction(expected => window.__sv?.editor.getValue() === expected, value);
let checks = 0;
let stage = 'initialization';
const check = async (name, fn) => { stage = name; await fn(); checks++; console.log('PASS ' + name); };
try {
  const make = async name => {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => { errors.push(stage + ': ' + error.message); console.error(error.stack); });
    await page.goto(`${base}/?name=${name}&role=student&room=${room}`);
    await page.waitForFunction(() => Boolean(window.__sv?.editor));
    await page.getByTestId('ai-load-demo-button').waitFor();
    return page;
  };
  const a = await make('PatchReview');
  const b = await make('Collaborator');
  await a.getByTestId('ai-load-demo-button').click();
  await waitText(b, source);
  const preview = async () => {
    await a.getByTestId('ai-suggest-patch-button').click();
    await a.getByRole('dialog').waitFor();
    await a.locator('.monaco-diff-editor').waitFor();
  };
  await check('sample preview renders an explicitly labelled Monaco diff', async () => {
    await preview();
    assert.ok((await a.getByRole('dialog').innerText()).includes('SAMPLE PATCH'));
    await a.getByRole('dialog').getByText('int', { exact: true }).first().waitFor();
  });
  await check('Reject leaves both shared editors unchanged and logs false', async () => {
    const decision = a.waitForRequest(r => r.url().endsWith('/api/ai/patch/decision'));
    await a.getByRole('button', { name: 'Reject patch', exact: true }).click();
    assert.equal((await decision).postDataJSON().accepted, false);
    assert.equal(await textOf(a), source); assert.equal(await textOf(b), source);
  });
  await check('Accept updates the collaborator and logs true', async () => {
    await preview();
    const decision = a.waitForRequest(r => r.url().endsWith('/api/ai/patch/decision'));
    await a.getByRole('button', { name: 'Accept patch', exact: true }).click();
    assert.equal((await decision).postDataJSON().accepted, true);
    await waitText(a, fixed); await waitText(b, fixed);
  });
  await check('remote edits disable Accept while the preview is open', async () => {
    await b.evaluate(value => window.__sv.editor.replaceAll(value), source);
    await waitText(a, source); await preview();
    await b.evaluate(value => window.__sv.editor.replaceAll(value), source + '\n# keep this edit');
    await waitText(a, source + '\n# keep this edit');
    await a.waitForFunction(() => [...document.querySelectorAll('button')].some(e => e.textContent === 'Accept patch' && e.disabled));
    assert.ok((await a.getByRole('dialog').innerText()).includes('shared editor changed'));
    assert.equal(await textOf(b), source + '\n# keep this edit');
  });
  await check('regeneration sends current source and preserves the new edit on Accept (mock provider)', async () => {
    let current;
    await a.route('**/api/ai/patch', async route => {
      current = route.request().postDataJSON().source;
      await route.fulfill({ json: { baseSource: current,
        patchedSource: current.replace('scores[0] + 1', 'int(scores[0]) + 1'),
        summary: 'Browser test fixture.', sourceChangedSinceRun: true, source: 'gemini' } });
    });
    await a.getByRole('button', { name: 'Regenerate for current code' }).click();
    await a.getByRole('dialog').waitFor();
    assert.equal(current, source + '\n# keep this edit');
    await a.getByRole('button', { name: 'Accept patch', exact: true }).click();
    await waitText(b, fixed + '\n# keep this edit');
    await a.unroute('**/api/ai/patch');
  });
  await check('changes while a request is pending make its returned preview stale (delayed fixture)', async () => {
    await b.evaluate(value => window.__sv.editor.replaceAll(value), source);
    await waitText(a, source);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    let requested;
    const seen = new Promise(resolve => { requested = resolve; });
    await a.route('**/api/ai/patch', async route => {
      requested(); await pending;
      await route.fulfill({ json: { baseSource: source, patchedSource: fixed,
        summary: 'Delayed browser fixture.', sourceChangedSinceRun: false, source: 'sample' } });
    });
    await a.getByTestId('ai-suggest-patch-button').click(); await seen;
    await b.evaluate(value => window.__sv.editor.replaceAll(value), source + '\n# arrived during request');
    await waitText(a, source + '\n# arrived during request'); release();
    await a.getByRole('dialog').waitFor();
    assert.equal(await a.getByRole('button', { name: 'Accept patch', exact: true }).isDisabled(), true);
    await a.getByRole('button', { name: 'Reject patch', exact: true }).click();
    assert.equal(await textOf(b), source + '\n# arrived during request');
    await a.unroute('**/api/ai/patch');
  });
  await check('provider failures show an error without changing code (mock quota error)', async () => {
    await a.route('**/api/ai/patch', route => route.fulfill({ status: 503,
      json: { code: 'ai_quota_exceeded', error: 'Gemini quota is unavailable for this model and key.' } }));
    const before = await textOf(a);
    await a.getByTestId('ai-suggest-patch-button').click();
    await a.getByTestId('ai-patch-error').waitFor();
    assert.equal(await a.getByRole('dialog').count(), 0);
    assert.equal(await textOf(a), before); assert.equal(await textOf(b), before);
    await a.unroute('**/api/ai/patch');
  });
  await b.evaluate(value => window.__sv.editor.replaceAll(value), source);
  await waitText(a, source); await preview();
  if (process.env.AI_SCREENSHOT) await a.screenshot({ path: process.env.AI_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(`${checks} Lane C browser checks passed. Regeneration/pending/error cases use explicit test mocks; sample Accept/Reject uses the real API.`);
} finally {
  await browser.close();
}
