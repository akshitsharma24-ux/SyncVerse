import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The Quiet Studio frontend: landing page, real rooms, every tool, layout, persistence, phones. Needs npm run dev.
// Screenshots and axe results go to <temp>/syncverse-studio.
const base = process.env.E2E_BASE ?? 'http://localhost:5173';
const OUT = path.join(os.tmpdir(), 'syncverse-studio');
await mkdir(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const check = async (name, fn) => { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: e.message }); console.log('FAIL', name, e.message); } };
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
try {
  await page.goto(base);
  await page.locator('.studio-preview').waitFor();
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: out('desktop.png'), fullPage: false, animations: 'disabled' });
  await check('Dark landing page and preview', async () => { assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); assert.equal(await page.locator('h1').innerText(), 'A little curiosity.\nA lot of possibility.'); assert(await noOverflow(page)); });
  await check('Create and join are centered, visible primary actions', async () => {
    const create = await page.getByTestId('hero-create').boundingBox();
    const join = await page.getByTestId('hero-join').boundingBox();
    assert(create && join);
    assert(Math.abs((create.x + join.x + join.width) / 2 - 720) < 5, 'Actions are not centered');
    assert(create.height >= 48 && join.height >= 48);
    assert(create.y < 650 && Math.abs(create.y - join.y) < 2);
    assert.equal(await page.locator('.landing-nav').getByRole('button', { name: /Join.*room/ }).count(), 0);
    await page.getByTestId('hero-join').click();
    assert(await page.getByTestId('entry-code').isVisible());
    await page.keyboard.press('Escape');
  });
  await check('Three interactive examples produce their matching preview output', async () => {
    for (const [file, output] of [['first_steps.py', 'Hello, You!'], ['fibonacci.py', '0 1 1 2 3 5 8 13'], ['small_wins.py', '100 minutes of progress.']]) {
      await page.locator('.preview-files').getByRole('button', { name: file }).click();
      await page.getByRole('button', { name: 'Run preview code' }).click();
      await page.waitForFunction(text => document.querySelector('.terminal-content')?.textContent.includes(text), output);
    }
  });
  await check('People preview and keyboard-dismissable create dialog', async () => {
    await page.locator('.preview-learn-tabs').getByRole('button', { name: /People/ }).click();
    assert.equal(await page.locator('.preview-person').count(), 3);
    await page.getByRole('button', { name: 'Bring your people' }).click();
    assert(await page.getByTestId('entry-dialog').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('entry-dialog').count(), 0);
  });
  await check('Landing accessibility audit', async () => {
    await page.evaluate(() => document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).forEach(a => a.finish()));
    await page.addScriptTag({ content: axe });
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    await writeFile(out('axe-landing.json'), JSON.stringify(result.violations, null, 2));
    assert.deepEqual(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), []);
  });
  await page.locator('.preview-files').getByRole('button', { name: 'first_steps.py' }).click();
  await page.locator('.preview-learn-tabs').getByRole('button', { name: 'Learn', exact: true }).click();
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach(el => el.classList.add('revealed')));
  await page.waitForTimeout(900);
  await page.screenshot({ path: out('landing-full.png'), fullPage: true });
  let room;
  await check('Create a real room through the new form', async () => {
    await page.getByTestId('hero-create').click();
    await page.getByTestId('entry-name').fill('Studio reviewer');
    await page.getByRole('button', { name: 'Mentor', exact: true }).click();
    room = await page.getByTestId('entry-generated').textContent();
    await page.getByTestId('entry-submit').click();
    await page.getByTestId('editor-host').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !!window.__sv?.editor);
    await page.waitForFunction(() => document.querySelector('[data-testid="editor-status"]')?.textContent.includes('live'));
    assert(await noOverflow(page));
  });
  await check('Edit code and copy a working invitation', async () => {
    await page.evaluate(() => window.__sv.editor.replaceAll('# A little curiosity goes a long way.\n\ndef learn_together(people):\n    for person in people:\n        print(f"Hello, {person}!")\n\nteam = ["You", "Asha", "Alex"]\nlearn_together(team)\n'));
    await page.getByTestId('copy-invite').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${base}/?room=${room}`);
  });
  await page.screenshot({ path: out('workspace.png'), fullPage: true });
  await check('Every workspace tool, focus mode, resizing, and history', async () => {
    assert(await page.locator('#workspace-sidebar').isHidden(), 'Sidebar should start collapsed');
    assert.equal(await page.getByText('One idea at a time', { exact: false }).count(), 0);
    const editor = await page.locator('.workspace-editor').boundingBox();
    const dock = await page.locator('.workspace-dock').boundingBox();
    const output = await page.locator('.workspace-console').boundingBox();
    assert(editor.y < 90 && editor.width > dock.width * 2 && editor.height > output.height * 2);
    assert(await page.locator('.studio-editor-title').getByRole('button', { name: 'Focus mode', exact: true }).isVisible());
    assert.equal(await page.getByRole('button', { name: 'Leave room', exact: true }).innerText(), 'Leave room');
    await page.getByRole('button', { name: 'Show sidebar', exact: true }).click();
    for (const id of ['video', 'board', 'quality', 'debug', 'progress', 'ai']) {
      await page.locator(`#tool-${id}`).click();
      assert(await page.locator(`#panel-${id}`).isVisible());
      assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    }
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
    assert(await page.locator('.workspace-dock').isHidden());
    assert(await page.locator('#workspace-sidebar').isHidden());
    assert(await page.locator('#console-panel').isHidden());
    await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
    assert(await page.locator('#workspace-sidebar').isVisible());
    assert(await page.locator('#console-panel').isVisible());
    const separator = page.getByRole('separator', { name: 'Resize console' });
    const previous = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus(); await page.keyboard.press('ArrowUp');
    assert.equal(Number(await separator.getAttribute('aria-valuenow')), previous + 20);
    await page.getByTestId('history-open').click();
    assert(await page.getByRole('dialog').isVisible());
    await page.keyboard.press('Escape');
  });
  await check('Panel dragging, collapsing, and layout persistence preserve the editor', async () => {
    const initialCode = await page.evaluate(() => window.__sv.editor.getValue());
    for (const [name, target, dx, dy, dimension] of [
      ['Resize console', '#console-panel', 0, -65, 'height'],
      ['Resize learning panel', '#learning-tools', -85, 0, 'width'],
      ['Resize sidebar', '#workspace-sidebar', 35, 0, 'width'],
    ]) {
      const handle = page.getByRole('separator', { name, exact: true });
      const bounds = await handle.boundingBox();
      const before = await page.locator(target).boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy, { steps: 8 });
      await page.mouse.up();
      const after = await page.locator(target).boundingBox();
      assert(after[dimension] > before[dimension] + 20, `${name} did not resize the actual panel`);
    }
    const dockHandle = page.getByRole('separator', { name: 'Resize learning panel' });
    const dockWidth = Number(await dockHandle.getAttribute('aria-valuenow'));
    await dockHandle.focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(Number(await dockHandle.getAttribute('aria-valuenow')), dockWidth + 20);
    await page.getByRole('button', { name: 'Close console', exact: true }).click();
    assert(await page.locator('#console-panel').isHidden());
    await page.getByRole('button', { name: 'Show console', exact: true }).click();
    await page.getByRole('button', { name: 'Close learning panel', exact: true }).click();
    assert(await page.locator('#learning-tools').isHidden());
    await page.getByRole('button', { name: 'Show learning panel', exact: true }).click();
    await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
    assert(await page.locator('#workspace-sidebar').isHidden());
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('studio.layout.v2')));
    await page.reload();
    await page.waitForFunction(() => !!window.__sv?.editor && window.__sv.editor.getValue().includes('learn_together'));
    assert.equal(await page.evaluate(() => window.__sv.editor.getValue()), initialCode);
    assert(await page.locator('#workspace-sidebar').isHidden());
    assert.equal(Number(await page.getByRole('separator', { name: 'Resize learning panel' }).getAttribute('aria-valuenow')), stored.learningWidth);
    assert.equal(Number(await page.getByRole('separator', { name: 'Resize console' }).getAttribute('aria-valuenow')), stored.consoleHeight);
    await page.getByLabel('Learning tool', { exact: true }).selectOption('video');
    assert(await page.getByTestId('video-join').isVisible());
    await page.getByLabel('Learning tool', { exact: true }).selectOption('ai');
  });
  await check('Second participant joins and receives real live edits', async () => {
    const secondContext = await browser.newContext();
    const second = await secondContext.newPage();
    second.on('pageerror', e => errors.push(e.message));
    await second.goto(`${base}/?room=${room}`);
    await second.getByTestId('entry-name').fill('Second learner');
    await second.getByTestId('entry-submit').click();
    await second.waitForFunction(() => !!window.__sv?.editor, { timeout: 15000 });
    await second.waitForFunction(() => window.__sv.editor.getValue().includes('learn_together'));
    await page.evaluate(() => window.__sv.editor.replaceAll('# Live sync verified\nprint("Keep going.")\n'));
    await second.waitForFunction(() => window.__sv.editor.getValue().includes('Live sync verified'));
    await secondContext.close();
  });
  await check('Workspace accessibility audit', async () => {
    await page.addScriptTag({ content: axe });
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    await writeFile(out('axe-workspace.json'), JSON.stringify(result.violations, null, 2));
    assert.deepEqual(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), []);
  });
  await check('Phone and tablet layouts, including a real mobile workspace', async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(base); await mobile.locator('.studio-preview').waitFor();
    assert(await noOverflow(mobile), '390px landing overflow');
    await mobile.screenshot({ path: out('mobile.png'), fullPage: true });
    await mobile.setViewportSize({ width: 768, height: 1024 }); assert(await noOverflow(mobile), '768px landing overflow');
    await mobile.setViewportSize({ width: 360, height: 780 }); assert(await noOverflow(mobile), '360px landing overflow');
    await mobile.getByTestId('hero-join').click();
    await mobile.getByTestId('entry-name').fill('Mobile learner');
    await mobile.getByTestId('entry-code').fill(room);
    await mobile.getByTestId('entry-submit').click();
    await mobile.getByTestId('editor-host').waitFor({ timeout: 15000 });
    assert(await noOverflow(mobile), '360px workspace overflow');
    const consoleHandle = mobile.getByRole('separator', { name: 'Resize console' });
    await consoleHandle.focus(); await mobile.keyboard.press('ArrowDown');
    assert.equal(Number(await consoleHandle.getAttribute('aria-valuenow')), 210);
    const learningHandle = mobile.getByRole('separator', { name: 'Resize learning panel' });
    await learningHandle.focus(); await mobile.keyboard.press('ArrowDown');
    assert.equal(Number(await learningHandle.getAttribute('aria-valuenow')), 460);
    const mobileConsole = await mobile.locator('#console-panel').boundingBox();
    const mobileLearning = await mobile.locator('#learning-tools').boundingBox();
    assert.equal(Math.round(mobileConsole.height), 210);
    assert.equal(Math.round(mobileLearning.height), 460);
    await mobile.getByRole('button', { name: 'Show sidebar', exact: true }).click();
    assert(await mobile.locator('#workspace-sidebar').isVisible());
    await mobile.keyboard.press('Escape');
    assert(await mobile.locator('#workspace-sidebar').isHidden());
    await mobile.screenshot({ path: out('mobile-workspace.png'), fullPage: true });
    await mobile.getByRole('button', { name: 'Leave room', exact: true }).click();
    await mobile.getByTestId('hero-create').waitFor();
    await mobileContext.close();
  });
  await check('No browser runtime errors', () => assert.deepEqual(errors, []));
} finally {
  await writeFile(out('results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
if (results.some(r => !r.pass)) process.exitCode = 1;
