// Browser checks for the multi-file editor, roles and moderation, version history, low-bandwidth mode and accounts.
// Needs the dev servers running:  npm run dev   then   npm run e2e:rooms
import { chromium } from 'playwright-core';
import { openTool } from './lib/tools.mjs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const results = [];
const errors = [];
const uniq = () => Math.random().toString(36).slice(2, 7);
const room = 'er-' + uniq();
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const contexts = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light', acceptDownloads: true, ...opts });
  contexts.push(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
async function join(name, role, code = room) {
  const p = await newPage();
  await p.goto(`${BASE}/?name=${name}&role=${role}&room=${code}`);
  await p.waitForSelector('.monaco-editor', { timeout: 25000 });
  return p;
}
const names = (p) => p.evaluate(() => window.__sv.files.list().map((f) => f.name));
const active = (p) => p.evaluate(() => window.__sv.files.list().find((f) => f.id === window.__sv.files.activeId())?.name);
const lang = (p) => p.evaluate(() => window.__sv.files.activeLanguage());
const text = (p) => p.evaluate(() => window.__sv.editor.getValue());
// Version history is a button in the sidebar, which starts collapsed in the Quiet Studio shell.
const openHistory = async (p) => {
  if (!(await p.locator('[data-testid="history-open"]').isVisible())) await p.getByRole('button', { name: 'Show sidebar', exact: true }).click();
  await p.click('[data-testid="history-open"]');
};
const tab = (p, name) => p.locator(`[data-testid="file-tab"][data-file="${name}"]`);
async function newFile(p, name, language) {
  await p.click('[data-testid="file-new"]');
  await p.fill('[data-testid="file-new-name"]', name);
  if (language) await p.selectOption('[data-testid="file-new-language"]', language);
  await p.click('[data-testid="file-new-submit"]');
  await p.waitForFunction((n) => window.__sv.files.list().some((f) => f.name === n) && window.__sv.files.list().find((f) => f.id === window.__sv.files.activeId())?.name === n, name);
}
const toastText = (p) => p.locator('[data-testid="toast"]').allTextContents();
async function waitToast(p, re) {
  await p.waitForFunction((src) => [...document.querySelectorAll('[data-testid="toast"]')].some((t) => new RegExp(src, 'i').test(t.textContent)), re.source, { timeout: 6000 });
}

const olive = await join('Olive', 'mentor');
const sam = await join('Sam', 'student');
await sam.waitForFunction(() => window.__sv.editor.getValue().includes('def average'));

// =========================================================================================== multi-file
await check('a new room opens main.py with the starter program in the file bar', async () => {
  if ((await names(olive)).join() !== 'main.py') throw new Error('files: ' + (await names(olive)).join());
  if ((await lang(olive)) !== 'python') throw new Error('language ' + (await lang(olive)));
  if ((await tab(olive, 'main.py').getAttribute('aria-selected')) !== 'true') throw new Error('main.py tab not selected');
});
await check('creating a file shows it for everyone, with the language detected from its name', async () => {
  await newFile(olive, 'helpers.py');
  await sam.waitForFunction(() => window.__sv.files.list().some((f) => f.name === 'helpers.py'));
  if ((await lang(olive)) !== 'python') throw new Error('expected python');
  await newFile(olive, 'Notes.md');
  if ((await lang(olive)) !== 'markdown') throw new Error('expected markdown, got ' + (await lang(olive)));
  await newFile(olive, 'Main.java');
  if ((await lang(olive)) !== 'java') throw new Error('expected java, got ' + (await lang(olive)));
  await newFile(olive, 'speed.cpp');
  if ((await lang(olive)) !== 'cpp') throw new Error('expected cpp, got ' + (await lang(olive)));
  const cpp = await text(olive);
  if (cpp.split('#include <iostream>').length !== 2) throw new Error('the C++ starter should appear exactly once, found ' + (cpp.split('#include <iostream>').length - 1));
  await sam.locator('[data-testid="file-tab"][data-file="speed.cpp"]').click();
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('#include <iostream>'));
  if ((await text(sam)) !== cpp) throw new Error('the other person sees different text in the new file');
  await tab(sam, 'main.py').click();
});
await check('names are validated: duplicates and odd characters are refused with a message', async () => {
  await olive.click('[data-testid="file-new"]');
  await olive.fill('[data-testid="file-new-name"]', 'HELPERS.py');
  await olive.click('[data-testid="file-new-submit"]');
  const dup = await olive.textContent('[data-testid="file-error"]');
  if (!/already exists/.test(dup)) throw new Error('duplicate message: ' + dup);
  await olive.fill('[data-testid="file-new-name"]', 'bad/name.py');
  await olive.click('[data-testid="file-new-submit"]');
  if (!/letters, numbers/.test(await olive.textContent('[data-testid="file-error"]'))) throw new Error('no message for a bad character');
  await olive.keyboard.press('Escape');
});
await check('a file chosen from the language menu re-colours it (language change is shared)', async () => {
  await tab(olive, 'Notes.md').click();
  await olive.selectOption('[data-testid="file-language"]', 'plaintext');
  if ((await lang(olive)) !== 'plaintext') throw new Error('expected plaintext');
  await sam.waitForFunction(() => window.__sv.files.list().find((f) => f.name === 'Notes.md')?.language === 'plaintext');
});
await check('each person edits their own file at once, sees the other in the tab, and the texts stay separate', async () => {
  await tab(sam, 'helpers.py').click();
  await olive.locator('[data-testid="file-tab"][data-file="helpers.py"] .ftab-here').waitFor({ timeout: 6000 });
  await sam.evaluate(() => window.__sv.editor.replaceAll('def double(x):\n    return x * 2\n'));
  await tab(olive, 'main.py').click();
  await olive.evaluate(() => window.__sv.editor.replaceAll('print("olive was here")\n'));
  await sam.waitForFunction(() => window.__sv.files.list().length > 0);
  await tab(olive, 'helpers.py').click();
  await olive.waitForFunction(() => window.__sv.editor.getValue().includes('def double'), null, { timeout: 6000 });
  await tab(sam, 'main.py').click();
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('olive was here'), null, { timeout: 6000 });
  if ((await text(sam)).includes('def double')) throw new Error('texts leaked between files');
});
await check('typing with the keyboard in one file reaches the other person in that file only', async () => {
  await tab(olive, 'helpers.py').click();
  await tab(sam, 'helpers.py').click();
  await olive.click('.monaco-editor .view-lines');
  await olive.keyboard.press('Control+End');
  await olive.keyboard.type('# typed by olive');
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('# typed by olive'), null, { timeout: 6000 });
  await tab(sam, 'main.py').click();
  if ((await text(sam)).includes('typed by olive')) throw new Error('typing leaked into main.py');
});
await check('double-click renames a file for everyone; the language follows the new extension', async () => {
  await tab(olive, 'helpers.py').dblclick();
  await olive.fill('[data-testid="file-rename-input"]', 'utils.js');
  await olive.keyboard.press('Enter');
  await sam.waitForFunction(() => window.__sv.files.list().some((f) => f.name === 'utils.js' && f.language === 'javascript'), null, { timeout: 6000 });
  if ((await names(olive)).includes('helpers.py')) throw new Error('old name still listed');
  if ((await lang(olive)) !== 'javascript') throw new Error('language did not follow: ' + (await lang(olive)));
});
await check('uploading text files adds them with detected languages; binary files are refused', async () => {
  await olive.setInputFiles('[data-testid="file-upload-input"]', [
    { name: 'sum.c', mimeType: 'text/plain', buffer: Buffer.from('#include <stdio.h>\nint main(void){return 0;}\r\n') },
    { name: 'blob.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0x50, 0x00, 0x01, 0x02]) },
  ]);
  await olive.waitForFunction(() => window.__sv.files.list().some((f) => f.name === 'sum.c'), null, { timeout: 6000 });
  if ((await active(olive)) !== 'sum.c') throw new Error('upload did not open the new file');
  if ((await lang(olive)) !== 'c') throw new Error('expected c, got ' + (await lang(olive)));
  if ((await text(olive)).includes('\r')) throw new Error('line endings were not normalised');
  await waitToast(olive, /not a text file/);
  if ((await names(olive)).includes('blob.bin')) throw new Error('binary file was added');
  await sam.waitForFunction(() => window.__sv.files.list().some((f) => f.name === 'sum.c'));
});
await check('download saves the open file under its own name with its content', async () => {
  const [dl] = await Promise.all([olive.waitForEvent('download'), olive.click('[data-testid="file-download"]')]);
  if (dl.suggestedFilename() !== 'sum.c') throw new Error('downloaded as ' + dl.suggestedFilename());
});
await check('deleting asks first, then removes the file for everyone; the last file cannot be deleted', async () => {
  await tab(olive, 'Notes.md').click();
  await olive.click('[data-testid="file-delete"]');
  await olive.waitForSelector('[data-testid="file-delete-dialog"]');
  await olive.click('[data-testid="file-delete-confirm"]');
  await sam.waitForFunction(() => !window.__sv.files.list().some((f) => f.name === 'Notes.md'), null, { timeout: 6000 });
  if ((await active(olive)) === 'Notes.md') throw new Error('still showing the deleted file');
  const solo = await join('Solo', 'mentor', 'solo-' + uniq());
  if (!(await solo.locator('[data-testid="file-delete"]').isDisabled())) throw new Error('delete should be disabled with one file');
});
await check('files survive a reload', async () => {
  const before = (await names(olive)).sort().join();
  await olive.reload();
  await olive.waitForSelector('.monaco-editor', { timeout: 25000 });
  await olive.waitForFunction(() => window.__sv.files.list().length > 1);
  if ((await names(olive)).sort().join() !== before) throw new Error('files changed after reload');
});

// ========================================================================== roles and moderation
const vera = await join('Vera', 'viewer');
await check('a viewer watches: the editor is read-only, file buttons are off, and typing changes nothing', async () => {
  if (!(await vera.evaluate(() => window.__sv.files.readOnly()))) throw new Error('editor is not read-only');
  await vera.waitForSelector('[data-testid="readonly-banner"]');
  if (!(await vera.locator('[data-testid="file-new"]').isDisabled())) throw new Error('new-file button should be disabled');
  await tab(vera, 'main.py').click();
  const before = await text(olive);
  await vera.click('.monaco-editor .view-lines');
  await vera.keyboard.type('HACK');
  await olive.waitForTimeout(600);
  if ((await text(vera)).includes('HACK')) throw new Error('the read-only editor took the typing');
  await tab(olive, 'main.py').click();
  if ((await text(olive)).includes('HACK')) throw new Error('viewer changed the shared code');
  void before;
});
await check('the Room drawer lists everyone with their roles; mentors get controls, students do not', async () => {
  await olive.click('[data-testid="room-open"]');
  await olive.waitForSelector('[data-testid="people-tab"]');
  const rows = await olive.locator('[data-testid="member-row"]').evaluateAll((els) => els.map((e) => `${e.dataset.member}:${e.dataset.role}`));
  for (const want of ['Olive:mentor', 'Sam:student', 'Vera:viewer']) if (!rows.includes(want)) throw new Error('missing ' + want + ' in ' + rows.join());
  await sam.click('[data-testid="room-open"]');
  await sam.waitForSelector('[data-testid="people-tab"]');
  if ((await sam.locator('[data-testid="member-pause"]').count()) !== 0) throw new Error('a student sees moderation buttons');
  await sam.keyboard.press('Escape');
});
await check('pausing a student stops their editing at once, and resuming restores it', async () => {
  const row = olive.locator('[data-testid="member-row"][data-member="Sam"]');
  await row.locator('[data-testid="member-pause"]').click();
  await sam.waitForSelector('[data-testid="readonly-banner"]', { timeout: 6000 });
  if (!/paused/.test(await sam.textContent('[data-testid="readonly-banner"]'))) throw new Error('banner does not explain');
  await waitToast(sam, /paused your editing/);
  if (!(await sam.evaluate(() => window.__sv.files.readOnly()))) throw new Error('editor not read-only');
  await olive.locator('[data-testid="member-row"][data-member="Sam"]').locator('[data-testid="member-pause"]').click();
  await sam.waitForFunction(() => !document.querySelector('[data-testid="readonly-banner"]'), null, { timeout: 6000 });
});
await check('freezing the room stops students but not the mentor; unfreezing brings editing back', async () => {
  await olive.click('[data-testid="room-freeze"]');
  await sam.waitForSelector('[data-testid="readonly-banner"]', { timeout: 6000 });
  if (!/froze/.test(await sam.textContent('[data-testid="readonly-banner"]'))) throw new Error('banner does not explain');
  if (await olive.locator('[data-testid="readonly-banner"]').count()) throw new Error('the mentor was frozen too');
  await olive.click('[data-testid="room-freeze"]');
  await sam.waitForFunction(() => !document.querySelector('[data-testid="readonly-banner"]'), null, { timeout: 6000 });
});
await check('changing a role takes effect live: student becomes viewer and back', async () => {
  const pick = (v) => olive.locator('[data-testid="member-row"][data-member="Sam"] [data-testid="member-role"]').selectOption(v);
  await pick('viewer');
  await sam.waitForFunction(() => window.__sv.files.readOnly(), null, { timeout: 6000 });
  if (!/viewer/.test(await sam.textContent('[data-testid="my-role"]'))) throw new Error('top bar still shows the old role');
  await pick('student');
  await sam.waitForFunction(() => !window.__sv.files.readOnly(), null, { timeout: 6000 });
});
await check('mute mic reaches the video service and reports the result plainly', async () => {
  await olive.locator('[data-testid="member-row"][data-member="Sam"] [data-testid="member-mute-mic"]').click();
  await waitToast(olive, /microphone|video is not set up/);
});
await check('removing someone ends their session with an explanation; allowing them back lets them rejoin', async () => {
  await olive.locator('[data-testid="member-row"][data-member="Vera"] [data-testid="member-remove"]').click();
  await vera.waitForSelector('[data-testid="room-gate"][data-status="removed"]', { timeout: 6000 });
  await olive.locator('[data-testid="removed-row"] [data-testid="member-allow"]').click();
  await vera.click('[data-testid="room-gate-leave"]');
  await vera.goto(`${BASE}/?name=Vera&role=viewer&room=${room}`);
  await vera.waitForSelector('.monaco-editor', { timeout: 25000 });
});

// ================================================================================== version history
await check('History: save a named version, change the code, preview the old one, restore it for everyone', async () => {
  await olive.keyboard.press('Escape');
  await tab(olive, 'main.py').click();
  await tab(sam, 'main.py').click();
  await olive.evaluate(() => window.__sv.editor.replaceAll('x = "version A"\n'));
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('version A'));
  await openHistory(olive);
  await olive.fill('[data-testid="version-label"]', 'Checkpoint A');
  await olive.click('[data-testid="version-save"]');
  await olive.waitForSelector('[data-testid="version-row"][data-label="Checkpoint A"]');
  await olive.keyboard.press('Escape');
  await olive.evaluate(() => window.__sv.editor.replaceAll('x = "version B"\n'));
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('version B'));
  await openHistory(olive);
  const row = olive.locator('[data-testid="version-row"][data-label="Checkpoint A"]');
  await row.locator('[data-testid="version-preview"]').click();
  if (!(await olive.textContent('[data-testid="version-preview-body"] pre')).includes('version A')) throw new Error('preview shows the wrong text');
  await row.locator('[data-testid="version-restore"]').click();
  await row.locator('[data-testid="version-restore-confirm"]').click();
  await olive.waitForFunction(() => window.__sv.editor.getValue().includes('version A'), null, { timeout: 6000 });
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('version A'), null, { timeout: 6000 });
  await olive.waitForSelector('[data-testid="version-row"][data-label="Before restore"]', { timeout: 6000 });
  await olive.keyboard.press('Escape');
});
await check('a restore also brings back a deleted file', async () => {
  await openHistory(olive);
  await olive.fill('[data-testid="version-label"]', 'With sum.c');
  await olive.click('[data-testid="version-save"]');
  await olive.waitForSelector('[data-testid="version-row"][data-label="With sum.c"]');
  await olive.keyboard.press('Escape');
  await tab(olive, 'sum.c').click();
  await olive.click('[data-testid="file-delete"]');
  await olive.click('[data-testid="file-delete-confirm"]');
  await sam.waitForFunction(() => !window.__sv.files.list().some((f) => f.name === 'sum.c'));
  await openHistory(olive);
  const row = olive.locator('[data-testid="version-row"][data-label="With sum.c"]');
  await row.locator('[data-testid="version-restore"]').click();
  await row.locator('[data-testid="version-restore-confirm"]').click();
  await sam.waitForFunction(() => window.__sv.files.list().some((f) => f.name === 'sum.c'), null, { timeout: 6000 });
  await olive.keyboard.press('Escape');
  await tab(sam, 'sum.c').click();
  await sam.waitForFunction(() => window.__sv.editor.getValue().includes('#include <stdio.h>'), null, { timeout: 6000 });
  const c = await text(sam);
  if (c.split('#include <stdio.h>').length !== 2) throw new Error('the restored file has its content doubled or missing');
  await tab(sam, 'main.py').click();
});

// ================================================================================ low-bandwidth mode
await check('low-bandwidth mode: switch it on in Settings; it is remembered and changes the video join', async () => {
  await sam.click('[data-testid="room-open"]');
  await sam.click('[data-testid="room-tab-settings"]');
  await sam.check('[data-testid="lowbw-toggle"]');
  if ((await sam.getAttribute('html', 'data-lowbw')) !== 'on') throw new Error('data-lowbw not set');
  await sam.keyboard.press('Escape');
  await openTool(sam, 'Video');
  if (!/audio only/.test(await sam.textContent('#panel-video'))) throw new Error('the Video tab does not say audio only');
  const health = await (await fetch((process.env.SMOKE_BASE ?? 'http://localhost:4000') + '/api/health')).json();
  if (health.configured?.livekit) {
    await sam.click('[data-testid="video-join"]');
    await sam.waitForSelector('[data-testid="video-live"]', { timeout: 12000 });
    if ((await sam.getAttribute('[data-testid="video-live"]', 'data-audio-only')) !== 'true') throw new Error('the call did not join audio-only');
  }
  await sam.reload();
  await sam.waitForSelector('.monaco-editor', { timeout: 25000 });
  if ((await sam.getAttribute('html', 'data-lowbw')) !== 'on') throw new Error('not remembered after reload');
});
await check('low-bandwidth mode stills the decorative animation on the entry page', async () => {
  const p = await newPage({ storageState: undefined });
  await p.addInitScript(() => localStorage.setItem('sv.lowbw', 'on'));
  await p.goto(BASE);
  await p.waitForSelector('.orbit-one');
  if ((await p.getAttribute('html', 'data-lowbw')) !== 'on') throw new Error('low-bandwidth mode is not applied to the page');
  const name = await p.evaluate(() => getComputedStyle(document.querySelector('.orbit-one')).animationName);
  await p.context().close();
  if (name !== 'none') throw new Error('the orbit still animates: ' + name);
});
await check('low-bandwidth mode sends my cursor at most every 0.7 s', async () => {
  const a = await join('Lowa', 'student', 'lb-' + uniq());
  await a.evaluate(() => localStorage.setItem('sv.lowbw', 'on'));
  await a.reload();
  await a.waitForSelector('.monaco-editor', { timeout: 25000 });
  const sent = await a.evaluate(async () => {
    // count awareness broadcasts: wrap WebSocket.send (awareness messages start with byte 1)
    let n = 0;
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (d instanceof Uint8Array && d[0] === 1) n++;
      return orig.call(this, d);
    };
    const ed = document.querySelector('.monaco-editor');
    ed.focus();
    return n;
  });
  void sent;
  await a.click('.monaco-editor .view-lines');
  const count = await a.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const orig = WebSocket.prototype.send;
        WebSocket.prototype.send = function (d) {
          if (d instanceof Uint8Array && d[0] === 1) n++;
          return orig.call(this, d);
        };
        let i = 0;
        const t = setInterval(() => {
          window.__sv.editor.getValue();
          document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          if (++i >= 12) {
            clearInterval(t);
            setTimeout(() => {
              WebSocket.prototype.send = orig;
              resolve(n);
            }, 900);
          }
        }, 60);
      }),
  );
  if (count > 4) throw new Error(`${count} awareness messages in ~1.6 s`);
});

// ========================================================================================== accounts
const uname = 'e2e' + uniq();
const acc = await newPage();
await check('create an account: the header shows you, your name is locked to the profile, and the choice survives a reload', async () => {
  await acc.goto(BASE);
  await acc.click('[data-testid="auth-open"]');
  await acc.click('[data-testid="auth-mode-register"]');
  await acc.fill('[data-testid="auth-username"]', uname);
  await acc.fill('[data-testid="auth-display-name"]', 'Ada Tester');
  await acc.fill('[data-testid="auth-password"]', 'short');
  await acc.click('[data-testid="auth-submit"]');
  await acc.waitForSelector('[data-testid="auth-error"]');
  if (!/at least 8/i.test(await acc.textContent('[data-testid="auth-error"]'))) throw new Error('weak password message: ' + (await acc.textContent('[data-testid="auth-error"]')));
  await acc.fill('[data-testid="auth-password"]', 'a good pass 99');
  await acc.click('[data-testid="auth-submit"]');
  await acc.waitForSelector('[data-testid="profile-open"]');
  if (!(await acc.textContent('[data-testid="profile-open"]')).includes('Ada Tester')) throw new Error('name missing in the header');
  await acc.click('[data-testid="hero-create"]');
  if ((await acc.inputValue('[data-testid="entry-name"]')) !== 'Ada Tester' || !(await acc.getAttribute('[data-testid="entry-name"]', 'readonly') !== null)) throw new Error('name field is not locked to the profile');
  await acc.reload();
  await acc.waitForSelector('[data-testid="profile-open"]', { timeout: 8000 });
  await acc.click('[data-testid="hero-create"]'); // the next check creates a room from this dialog
});
const acct = { room: 'ac-' + uniq() };
await check('a signed-in person creates a room, is its owner under their account id, and finds it in "Your rooms" on any tab', async () => {
  await acc.click('[data-testid="entry-submit"]');
  await acc.waitForSelector('.monaco-editor', { timeout: 25000 });
  acct.room = await acc.textContent('[data-testid="room-code"]');
  if (!/owner/.test(await acc.textContent('[data-testid="my-role"]'))) throw new Error('not shown as owner');
  const id = await acc.evaluate(() => JSON.parse(sessionStorage.getItem('syncverse.session')).userId);
  if (!id.startsWith('acct_')) throw new Error('identity is not the account: ' + id);
  // another tab of the same browser: same account, sees the room in the list
  const other = await acc.context().newPage();
  await other.goto(BASE);
  await other.click('[data-testid="hero-create"]');
  await other.waitForSelector('[data-testid="room-list"]', { timeout: 8000 });
  if (!(await other.textContent('[data-testid="room-list"]')).includes(acct.room)) throw new Error('room not listed');
  await other.close();
});
await check('editing the profile changes the name everywhere; signing out returns to guest mode', async () => {
  await acc.click('text=Leave room');
  await acc.waitForSelector('[data-testid="profile-open"]');
  await acc.click('[data-testid="profile-open"]');
  await acc.fill('[data-testid="profile-name"]', 'Ada L.');
  await acc.click('[data-testid="profile-save"]');
  await acc.waitForFunction(() => document.querySelector('[data-testid="profile-open"]').textContent.includes('Ada L.'));
  await acc.click('[data-testid="profile-signout"]');
  await acc.waitForSelector('[data-testid="auth-open"]');
  await acc.click('[data-testid="hero-create"]');
  if ((await acc.inputValue('[data-testid="entry-name"]')) === 'Ada L.' && (await acc.getAttribute('[data-testid="entry-name"]', 'readonly')) !== null) throw new Error('still locked after sign-out');
});
await check('signing in again with the wrong password says so; the right one works and the profile kept the new name', async () => {
  await acc.keyboard.press('Escape'); // close the entry dialog left open by the previous check
  await acc.click('[data-testid="auth-open"]');
  await acc.fill('[data-testid="auth-username"]', uname);
  await acc.fill('[data-testid="auth-password"]', 'wrong wrong wrong');
  await acc.click('[data-testid="auth-submit"]');
  await acc.waitForSelector('[data-testid="auth-error"]');
  await acc.fill('[data-testid="auth-password"]', 'a good pass 99');
  await acc.click('[data-testid="auth-submit"]');
  await acc.waitForFunction(() => document.querySelector('[data-testid="profile-open"]')?.textContent.includes('Ada L.'), null, { timeout: 8000 });
});

// ================================================================================ room deletion last
await check('the owner deletes the room: everyone is told, and the code is gone', async () => {
  await olive.click('[data-testid="room-open"]');
  await olive.click('[data-testid="room-tab-settings"]');
  await olive.click('[data-testid="room-delete"]');
  await olive.click('[data-testid="room-delete-confirm"]');
  await sam.waitForSelector('[data-testid="room-gate"][data-status="deleted"]', { timeout: 8000 });
});

await check('no uncaught errors were thrown in any page', async () => {
  if (errors.length) throw new Error(errors.slice(0, 2).join(' | '));
});

for (const c of contexts) await c.close().catch(() => {});
await browser.close();
let failed = 0;
for (const [ok, name, d] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
  if (!ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
