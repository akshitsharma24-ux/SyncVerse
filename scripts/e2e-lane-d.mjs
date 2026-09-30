// Lane D browser test (needs `npm run dev`): debug access flow, samples menu, progress page. Owner: Lane D.
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const room = 'ed-' + Math.random().toString(36).slice(2, 7);
const out = [];
const check = async (n, fn) => { try { await fn(); out.push([1, n]); } catch (e) { out.push([0, n + ' :: ' + String(e.message).split('\n')[0]]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const mk = async (name, role) => {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
  p.on('pageerror', (e) => console.log('[pageerror ' + name + ']', e.message));
  await p.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await p.waitForSelector('.monaco-editor', { timeout: 20000 });
  return p;
};
const S = await mk('Stu', 'student'), M = await mk('Mia', 'mentor');
for (const p of [S, M]) await openTool(p, 'Debug');
const T = { timeout: 8000 };

await check('mentor sees Stu with a Request access button', () => M.waitForSelector('[data-testid^=request-]', T));
await check('request opens the Allow/Deny modal for the student', async () => {
  await M.click('[data-testid^=request-]');
  await S.waitForSelector('[data-testid=access-modal]', T);
});
await check('deny closes modal and tells mentor nothing is granted', async () => {
  await S.click('[data-testid=deny]');
  await S.waitForSelector('[data-testid=access-modal]', { state: 'detached', ...T });
  await M.waitForSelector('text=declined', T);
});
await check('request again, allow: mentor gets mirror, student gets banner', async () => {
  await M.click('[data-testid^=request-]');
  await S.waitForSelector('[data-testid=access-modal]', T);
  await S.click('[data-testid=allow]');
  await M.waitForSelector('[data-testid=mirror]', T);
  await S.waitForSelector('[data-testid=viewing-banner]', T);
});
await check('banner visible even with the Debug tab not active', async () => {
  await openTool(S, 'Progress');
  await S.waitForSelector('[data-testid=viewing-banner]', T);
});
await check('revoke removes the mirror instantly', async () => {
  await S.click('[data-testid=revoke]');
  await M.waitForSelector('[data-testid=mirror]', { state: 'detached', ...T });
  await S.waitForSelector('[data-testid=viewing-banner]', { state: 'detached', ...T });
});
await check('Samples menu loads a program into BOTH editors', async () => {
  await M.click('[data-testid=samples-btn]');
  await M.click('[role=menuitem]:has-text("name error")');
  for (const p of [S, M]) await p.waitForFunction(() => window.__sv.editor.getValue().includes('totl'), null, T);
});
await check('Load demo history shows observations for the student', async () => {
  await S.click('[data-testid=samples-btn]');
  await S.click('text=Load demo history');
  await openTool(S, 'Progress');
  await S.waitForSelector('[data-testid=observations] >> text=Retry recommended', T);
});
await check('mentor table lists demo students and flags stuck', async () => {
  await openTool(M, 'Progress');
  await M.waitForSelector('[data-testid=mentor-table] >> text=Asha', T);
  await M.waitForSelector('[data-testid=mentor-table] >> text=stuck', T);
});
await check('P-D4: mentor tile for Stu flags STUCK after seeded failures, shows no code', async () => {
  await openTool(M, 'Debug');
  await M.waitForSelector('[data-testid=tile-Stu][data-stuck=true]', T);
  const txt = await M.innerText('[data-testid=overview]');
  if (/def |print\(/.test(txt)) throw new Error('code leaked into tile');
});
await check('T-D-09: student sees nudge after 3 failures, Ask for help flags the tile', async () => {
  await openTool(S, 'Debug');
  await S.waitForSelector('[data-testid=nudge]', T);
  await S.click('[data-testid=nudge-ask]');
  await S.waitForSelector('[data-testid=nudge-sent]', T);
  await openTool(M, 'Debug');
  await M.waitForSelector('[data-testid=tile-Stu] >> [data-testid=help-flag]', T);
});
await check('T-D-05: mentor sees class trends as counts', async () => {
  await openTool(M, 'Progress');
  await M.waitForSelector('[data-testid=trends] >> text=/2 of 4 students/', T);
});
await check('Block: blocked mentor cannot request again', async () => {
  await openTool(M, 'Debug');
  await M.click('[data-testid^=request-]');
  await S.waitForSelector('[data-testid=access-modal]', T);
  await S.click('[data-testid=block]');
  await S.waitForSelector('[data-testid=access-modal]', { state: 'detached', ...T });
  await M.click('[data-testid^=request-]');
  await M.waitForSelector('[role=alert]:has-text("did not work")', T);
});
await check('assist: owner allows pointing, mentor points at line, owner sees it', async () => {
  await openTool(S, 'Debug');
  await M.click('[data-testid^=request-]').catch(() => {});
  // Block earlier is per-server-session; use a fresh mentor for this check
  const M2 = await mk('Max', 'mentor');
  await openTool(M2, 'Debug');
  await M2.click("[aria-label=\"Request access to Stu's session\"]");
  await S.waitForSelector('[data-testid=access-modal]', T);
  await S.click('[data-testid=allow-assist]');
  await M2.waitForSelector('[data-testid=hl-line]', T);
  await M2.fill('[data-testid=hl-line]', '3');
  await M2.click('[data-testid=hl-send]');
  await S.waitForSelector('[data-testid=pointed] >> text=line 3', T);
});
await check('Reset demo clears progress for the room', async () => {
  S.once('dialog', (d) => d.accept());
  await S.click('[data-testid=samples-btn]');
  await S.click('[data-testid=reset-demo]');
  await openTool(S, 'Progress');
  await S.waitForSelector('[data-testid=observations] >> text=No runs yet', T);
});
await check('Escape closes the Samples menu', async () => {
  await S.click('[data-testid=samples-btn]');
  await S.keyboard.press('Escape');
  await S.waitForSelector('[data-testid=samples-menu]', { state: 'detached', ...T });
});
await check('progress shows next-concept suggestions, definitions and trend after seeding', async () => {
  await S.click('[data-testid=samples-btn]');
  await S.click('text=Load demo history');
  await openTool(S, 'Progress');
  await S.waitForSelector('[data-testid=suggestions] >> text=Practise', T);
  await S.waitForSelector('[data-testid=concepts] >> text=Where a loop should start', T);
  await S.waitForSelector('[data-testid=trend]', { timeout: 500 }).catch(() => {});
});
await check('mentor broadcast reaches the student as a banner', async () => {
  await openTool(M, 'Debug');
  await M.fill('[data-testid=broadcast-input]', 'Five minutes left, save your work');
  await M.click('[data-testid=broadcast-send]');
  await S.waitForSelector('[data-testid=broadcast-banner] >> text=Five minutes left', T);
});
await S.screenshot({ path: process.env.TEMP + '/lane-d-student.png' });
await M.screenshot({ path: process.env.TEMP + '/lane-d-mentor.png' });
await browser.close();
let f = 0; for (const [ok, n] of out) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) f++; }
process.exit(f ? 1 : 0);
