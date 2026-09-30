// Offline / reconnect: kill the API server while two people are editing, keep typing offline, restart it, and check
// that nothing is lost and both sides converge. Starts its OWN server (:4300) and web app (:5300); does not touch npm run dev.
//   npm run e2e:reconnect
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const API = 4300;
const WEB = 5300;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-reconnect-'));
const room = 'rc-' + Math.random().toString(36).slice(2, 6);
const procs = [];
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, label, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pred()) return;
    await sleep(100);
  }
  throw new Error('timed out: ' + label);
}
const ok = (url) => fetch(url).then((r) => r.ok).catch(() => false);

function startApi() {
  const p = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(API), COLLAB_DATA_DIR: dir },
    stdio: 'ignore',
  });
  procs.push(p);
  return p;
}
function startWeb() {
  const vite = path.resolve('node_modules/vite/bin/vite.js');
  const p = spawn(process.execPath, [vite, '--port', String(WEB), '--strictPort'], {
    cwd: path.resolve('web'),
    env: { ...process.env, SYNCVERSE_SERVER: `http://localhost:${API}` },
    stdio: 'ignore',
  });
  procs.push(p);
  return p;
}

let browser;
try {
  let api = startApi();
  startWeb();
  await until(() => ok(`http://localhost:${API}/api/health`), 'api up');
  await until(() => ok(`http://localhost:${WEB}/`), 'web up', 30000);

  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
  const mk = async (name) => {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
    await page.goto(`http://localhost:${WEB}/?name=${name}&role=student&room=${room}`);
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes('live'), null, { timeout: 15000 });
    return page;
  };
  const A = await mk('Akshit');
  const B = await mk('Miti');
  const val = (p) => p.evaluate(() => window.__sv.editor.getValue());
  const has = (p, s) => p.waitForFunction((x) => window.__sv.editor.getValue().includes(x), s, { timeout: 15000 });

  await A.click('.monaco-editor .view-lines');
  await A.keyboard.press('Control+End');
  await A.keyboard.type('\n# before the outage', { delay: 10 });
  await has(B, '# before the outage');
  await sleep(1200); // let the debounced save land on disk

  api.kill(); // hard kill: the server disappears mid-session
  await new Promise((r) => api.once('exit', r));

  await check('after the server dies the status pill shows offline/connecting, not "live"', async () => {
    await A.waitForFunction(() => /offline|connecting/.test(document.body.innerText) && !/\blive\b/.test(document.querySelector('[data-testid="editor-status"]')?.innerText ?? ''), null, { timeout: 15000 });
  });

  await check('status chip says "Server offline" while the API is down', async () => {
    await A.waitForSelector('[data-testid="status-chip"][data-state="offline"]', { timeout: 15000 });
  });
  await check('typing while offline still works locally', async () => {
    await A.keyboard.press('Control+End');
    await A.keyboard.type('\n# typed while offline', { delay: 10 });
    if (!(await val(A)).includes('# typed while offline')) throw new Error('offline edit not in A');
    if ((await val(B)).includes('# typed while offline')) throw new Error('B saw it without a server?!');
  });

  api = startApi();
  await until(() => ok(`http://localhost:${API}/api/health`), 'api up again');

  await check('both tabs reconnect and the status returns to live', async () => {
    await A.waitForFunction(() => /\blive\b/.test(document.querySelector('[data-testid="editor-status"]')?.innerText ?? ''), null, { timeout: 25000 });
    await B.waitForFunction(() => /\blive\b/.test(document.querySelector('[data-testid="editor-status"]')?.innerText ?? ''), null, { timeout: 25000 });
  });

  await check('status chip recovers after the API is back', async () => {
    await A.waitForSelector('[data-testid="status-chip"]:not([data-state="offline"]):not([data-state="checking"])', { timeout: 15000 });
  });
  await check('the offline edit reaches the other person after reconnect', () => has(B, '# typed while offline'));

  await check('both converge to identical text; starter and earlier edit appear exactly once', async () => {
    await until(async () => (await val(A)) === (await val(B)), 'A == B', 10000);
    const t = await val(A);
    for (const s of ['def average', '# before the outage', '# typed while offline']) {
      if (t.split(s).length !== 2) throw new Error(`"${s}" appears ${t.split(s).length - 1} times`);
    }
  });
} catch (e) {
  results.push([false, 'test harness', String(e.message)]);
} finally {
  await browser?.close().catch(() => {});
  procs.forEach((p) => p.kill());
  await sleep(300);
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const [okk, name, d] of results) console.log(`${okk ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.length && results.every((r) => r[0]) ? 0 : 1);


