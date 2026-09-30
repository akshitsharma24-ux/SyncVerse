// The shared whiteboard (Board tab), in real browsers: a mentor, a student and a viewer in one room.
// Needs the dev servers running:  npm run dev   then   npm run e2e:whiteboard
// Owner: Lane A.
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const room = 'board-' + Math.random().toString(36).slice(2, 7);
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

// The learning tools live in the side panel of the Quiet Studio shell; its tool picker is always visible.
const openBoard = (p) => openTool(p, 'Board');

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const mk = async (name, role, withBoard = true) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 820 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, e.message));
  await page.goto(`${BASE}/?name=${name}&role=${role}&room=${room}`);
  await page.waitForSelector('.monaco-editor', { timeout: 20000 });
  await page.waitForFunction(() => window.__sv?.collab, null, { timeout: 10000 });
  if (withBoard) await openBoard(page);
  await page.waitForSelector('[data-testid="board-canvas"]', { state: 'visible' });
  return page;
};

// The first person into a room is its owner (and so can moderate); Asha comes first.
const B = await mk('Asha', 'mentor');
const A = await mk('Ravi', 'student');
const V = await mk('Vik', 'viewer');

const shapes = (p) => p.locator('[data-testid="board-canvas"]').getAttribute('data-shapes').then(Number);
const waitShapes = (p, n, label) =>
  p
    .waitForFunction((want) => Number(document.querySelector('[data-testid="board-canvas"]')?.getAttribute('data-shapes')) === want, n, { timeout: 8000 })
    .catch(async () => {
      throw new Error(`${label}: expected ${n} shapes, has ${await shapes(p)}`);
    });
const canvasBox = async (p) => (await p.locator('[data-testid="board-canvas"]').boundingBox());
/** x, y as fractions of the canvas -> page coordinates */
const at = async (p, fx, fy) => {
  const b = await canvasBox(p);
  return [b.x + b.width * fx, b.y + b.height * fy];
};
async function drag(p, from, to, steps = 12) {
  const [x1, y1] = await at(p, ...from);
  const [x2, y2] = await at(p, ...to);
  await p.mouse.move(x1, y1);
  await p.mouse.down();
  await p.mouse.move(x2, y2, { steps });
  await p.mouse.up();
}
/** Is there ink (anything that is not the dark page colour, the faint dots included) at this fraction of the canvas? Looks at a small square. */
const inkAt = (p, fx, fy) =>
  p.evaluate(
    ([fx, fy]) => {
      const c = document.querySelector('[data-testid="board-canvas"]');
      const ctx = c.getContext('2d');
      const cx = Math.round(c.width * fx);
      const cy = Math.round(c.height * fy);
      const d = ctx.getImageData(cx - 3, cy - 3, 7, 7).data;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0x15) > 40 || Math.abs(d[i + 1] - 0x17) > 40 || Math.abs(d[i + 2] - 0x14) > 40) return true;
      return false;
    },
    [fx, fy],
  );
const pick = (p, id) => p.click(`[data-testid="board-tool-${id}"]`);

await check('the Board tab exists and shows an empty board to everyone', async () => {
  for (const p of [A, B, V]) expectEq(await shapes(p), 0, 'shapes');
  await A.waitForSelector('[data-testid="board-panel"]');
});

await check('a pen stroke drawn by the student appears for the mentor and the viewer', async () => {
  await pick(A, 'pen');
  await drag(A, [0.1, 0.2], [0.5, 0.2]);
  await waitShapes(A, 1, 'A');
  await waitShapes(B, 1, 'B');
  await waitShapes(V, 1, 'V');
  await B.waitForFunction(() => true);
  if (!(await inkAt(B, 0.3, 0.2))) throw new Error('no ink on the mentor screen');
  if (!(await inkAt(V, 0.3, 0.2))) throw new Error('no ink on the viewer screen');
});

await check('while someone is still drawing, others already see the stroke and who is drawing', async () => {
  const [x1, y1] = await at(A, 0.1, 0.5);
  const [x2, y2] = await at(A, 0.6, 0.5);
  await A.mouse.move(x1, y1);
  await A.mouse.down();
  await A.mouse.move(x2, y2, { steps: 15 });
  await B.waitForFunction(() => /Ravi is drawing/.test(document.querySelector('[data-testid="board-status"]')?.textContent ?? ''), null, { timeout: 5000 });
  if (!(await inkAt(B, 0.3, 0.5))) throw new Error('live stroke not drawn on the mentor screen');
  expectEq(await shapes(B), 1, 'shapes before pen up');
  await A.mouse.up();
  await waitShapes(B, 2, 'B after pen up');
  await B.waitForFunction(() => !/is drawing/.test(document.querySelector('[data-testid="board-status"]')?.textContent ?? ''), null, { timeout: 5000 });
});

await check('mentor draws a rectangle, an ellipse, an arrow and a line: everyone gets all of them', async () => {
  await pick(B, 'rect');
  await drag(B, [0.1, 0.65], [0.3, 0.9]);
  await pick(B, 'ellipse');
  await drag(B, [0.4, 0.65], [0.6, 0.9]);
  await pick(B, 'arrow');
  await drag(B, [0.7, 0.65], [0.95, 0.9]);
  await pick(B, 'line');
  await drag(B, [0.7, 0.1], [0.95, 0.4]);
  for (const p of [A, B, V]) await waitShapes(p, 6, 'shape count');
  if (!(await inkAt(A, 0.1, 0.775))) throw new Error('rectangle edge missing'); // left edge of the rectangle
  if (!(await inkAt(A, 0.825, 0.25))) throw new Error('line missing');
});

await check('text: click, type, Enter places it for everyone', async () => {
  await pick(A, 'text');
  const [x, y] = await at(A, 0.15, 0.35);
  await A.mouse.click(x, y);
  await A.locator('[data-testid="board-text-input"]').fill('head -> tail');
  await A.keyboard.press('Enter');
  await waitShapes(A, 7, 'A');
  await waitShapes(B, 7, 'B');
  if (await A.locator('[data-testid="board-text-input"]').count()) throw new Error('the text box stayed open');
});

await check('eraser: dragging over a shape removes it for everyone (mentor erases the student stroke)', async () => {
  await pick(B, 'eraser');
  await drag(B, [0.05, 0.2], [0.55, 0.2], 25);
  await waitShapes(B, 6, 'B');
  await waitShapes(A, 6, 'A');
  if (await inkAt(A, 0.3, 0.2)) throw new Error('the stroke is still drawn');
});

await check('undo takes back only my own last shape', async () => {
  // Ravi has: the live stroke and the text. Asha has the four shapes. Ravi undoes twice; Asha's shapes stay.
  await A.click('[data-testid="board-undo"]');
  await waitShapes(B, 5, 'after first undo');
  await A.click('[data-testid="board-undo"]');
  await waitShapes(B, 4, 'after second undo');
  if (!(await A.locator('[data-testid="board-undo"]').isDisabled())) throw new Error('undo should be disabled when I have nothing left');
  expectEq(await shapes(A), 4, 'A shapes');
});

await check('Ctrl+Z on the board also undoes (for my own shape)', async () => {
  await pick(A, 'pen');
  await drag(A, [0.1, 0.45], [0.3, 0.45]);
  await waitShapes(B, 5, 'B');
  await A.keyboard.press('Control+z');
  await waitShapes(B, 4, 'B after ctrl+z');
});

await check('only a mentor sees Clear; the student does not', async () => {
  expectEq(await A.locator('[data-testid="board-clear"]').count(), 0, 'student clear buttons');
  expectEq(await B.locator('[data-testid="board-clear"]').count(), 1, 'mentor clear buttons');
});

await check('viewer: tools are off, the reason is shown, drawing does nothing', async () => {
  if (!(await V.locator('[data-testid="board-tool-pen"]').isDisabled())) throw new Error('pen should be disabled');
  await V.waitForSelector('[data-testid="board-readonly"]');
  await drag(V, [0.2, 0.3], [0.4, 0.3]);
  await B.waitForTimeout(600);
  expectEq(await shapes(B), 4, 'shapes after the viewer drags');
});

await check('viewer: even a hand-made write is refused by the server', async () => {
  await V.evaluate(() => window.__sv.collab.doc.getArray('board').push([{ id: 'hack', by: 'x', tool: 'line', color: '#151515', size: 6, pts: [0, 0, 1000, 800] }]));
  await B.waitForTimeout(900);
  expectEq(await shapes(B), 4, 'shapes on the mentor screen');
  // the viewer's own copy keeps the refused item until it reloads; after a reload it matches the room again
  await V.reload();
  await V.waitForSelector('.monaco-editor', { timeout: 20000 });
  await openBoard(V);
  await waitShapes(V, 4, 'viewer after reload');
});

await check('junk written straight into the document is ignored or made safe, nothing crashes', async () => {
  await A.evaluate(() => {
    const arr = window.__sv.collab.doc.getArray('board');
    arr.push([
      { tool: 'pen', pts: [1, 2, 'x'], color: '#123456' }, // not numbers
      { tool: 'pen', pts: [1, 2, 3], color: '#123456' }, // odd length
      { tool: 'nuke', pts: [1, 2, 3, 4] }, // unknown tool
      'just a string',
      null,
      { tool: 'text', pts: [10, 10], text: '   ', color: '#151515' }, // nothing to show
      { id: 'ok', by: 'Ravi', tool: 'text', pts: [99999, -50], text: 'x'.repeat(5000), color: 'red;}</style>', size: 9999 }, // usable once made safe
    ]);
  });
  await waitShapes(B, 5, 'only the one usable shape is counted');
  await B.waitForTimeout(300);
  if (await B.locator('[data-testid="panel-crash"]').count()) throw new Error('a panel crashed');
});

await check('the expanded view fills the window, keeps the drawing, and Esc closes it', async () => {
  const before = (await canvasBox(B)).width;
  await B.click('[data-testid="board-expand"]');
  await B.waitForFunction(() => document.querySelector('[data-testid="board-panel"]')?.getAttribute('data-expanded') === 'true');
  await B.waitForTimeout(300);
  const big = (await canvasBox(B)).width;
  if (big < before * 1.8) throw new Error(`canvas only grew from ${Math.round(before)} to ${Math.round(big)} px`);
  expectEq(await shapes(B), 5, 'shapes kept');
  // drawing works in the large view, at the same board position as a small one
  await pick(B, 'pen');
  await drag(B, [0.1, 0.05], [0.4, 0.05]);
  await waitShapes(A, 6, 'A sees the stroke drawn in the large view');
  await B.keyboard.press('Escape');
  await B.waitForFunction(() => document.querySelector('[data-testid="board-panel"]')?.getAttribute('data-expanded') === 'false');
  expectEq(await shapes(B), 6, 'shapes kept after closing');
});

await check('Save as picture downloads a PNG named after the room', async () => {
  const [dl] = await Promise.all([B.waitForEvent('download', { timeout: 8000 }), B.click('[data-testid="board-save"]')]);
  expectEq(dl.suggestedFilename(), `whiteboard-${room}.png`, 'file name');
});

await check('the board survives a page reload (saved with the room)', async () => {
  await B.reload();
  await B.waitForSelector('.monaco-editor', { timeout: 20000 });
  await openBoard(B);
  await waitShapes(B, 6, 'B after reload');
});

await check('mentor Clear asks twice, then empties the board for everyone', async () => {
  await B.click('[data-testid="board-clear"]');
  await B.click('[data-testid="board-clear-confirm"]');
  for (const p of [A, B, V]) await waitShapes(p, 0, 'cleared');
});

await check('a student paused by the mentor cannot draw, and the server refuses a hand-made write too', async () => {
  await B.click('[data-testid="room-open"]');
  await B.locator('[data-testid="member-row"][data-member="Ravi"] [data-testid="member-pause"]').click();
  await A.waitForFunction(() => document.querySelector('[data-testid="board-tool-pen"]')?.disabled === true, null, { timeout: 6000 });
  await A.waitForSelector('[data-testid="board-readonly"]');
  await A.evaluate(() => window.__sv.collab.doc.getArray('board').push([{ id: 'p1', by: 'x', tool: 'line', color: '#151515', size: 6, pts: [0, 0, 500, 500] }]));
  await B.waitForTimeout(900);
  expectEq(await shapes(B), 0, 'shapes on the mentor screen');
});

await browser.close();
for (const [ok, name, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
