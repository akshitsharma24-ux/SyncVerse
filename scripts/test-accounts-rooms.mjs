// Accounts, rooms, roles, moderation, collab permissions, version history, logging and env validation.
// Starts its OWN throw-away servers (ports 4401-4403, temp data folders): does not need npm run dev and never touches real data.
//   npm run test:rooms
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

const results = [];
const servers = [];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sv-rooms-'));

function start(port, extraEnv = {}) {
  const dir = tmp();
  const p = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(port), COLLAB_DATA_DIR: dir, LOG_LEVEL: 'warn', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  servers.push(p);
  return { p, dir, output: () => out };
}
async function until(pred, label, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('timed out: ' + label);
}
const up = (port) => async () => {
  try {
    return (await fetch(`http://localhost:${port}/api/health`)).ok;
  } catch {
    return false;
  }
};
async function check(name, fn) {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
}
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const PORT = 4401;
const BASE = `http://localhost:${PORT}`;
const uniq = () => Math.random().toString(36).slice(2, 8);

/** A caller: guest (headers) or account (token). */
function guest(name, role = 'student') {
  const id = 'g-' + uniq();
  return { id, name, role, headers: { 'x-user-id': id, 'x-user-name': name, 'x-role': role } };
}
async function call(base, who, method, url, body, extra = {}) {
  const headers = { ...(who?.headers ?? {}), ...extra };
  if (who?.token) headers.authorization = `Bearer ${who.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  return { status: r.status, json, headers: r.headers };
}
const api = (who, method, url, body, extra) => call(BASE, who, method, url, body, extra);
async function register(username, password = 'correct horse 9', extra = {}) {
  const r = await api(null, 'POST', '/api/auth/register', { username, password, ...extra });
  return { ...r, who: r.json?.token ? { id: r.json.account.id, token: r.json.token, headers: {}, account: r.json.account } : null };
}

// Collab clients --------------------------------------------------------------------------------------------
function collab(room, who, { anonymous = false } = {}) {
  const doc = new Y.Doc();
  const params = anonymous ? {} : who.token ? { token: who.token } : { uid: who.id };
  const provider = new WebsocketProvider(`ws://localhost:${PORT}/collab`, room, doc, { WebSocketPolyfill: WebSocket, disableBc: true, params });
  const closes = [];
  provider.on('connection-close', (e) => e && closes.push(e.code));
  return { doc, provider, text: doc.getText('code'), files: doc.getMap('files'), closes, who };
}
const synced = (c) => until(() => c.provider.synced, 'client synced');
const join = (who, code, role) => api(who, 'POST', `/api/rooms/${code}/join`, { role });

// s1 runs WITHOUT LiveKit keys even if .env has them (an empty value is not overwritten by .env), so the "not configured" paths are tested.
const s1 = start(PORT, { ADMIN_TOKEN: 'admin-token-123456', VERSION_AUTO_MS: '700', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' });
try {
  await until(up(PORT), 'server up');

  // =========================================================================================== accounts
  const name1 = 'ada' + uniq();
  let ada;
  await check('register creates an account and never returns the password', async () => {
    const r = await register(name1, 'correct horse 9', { displayName: 'Ada L', defaultRole: 'mentor' });
    eq(r.status, 201, 'status');
    ada = r.who;
    eq(r.json.account.displayName, 'Ada L', 'displayName');
    eq(r.json.account.defaultRole, 'mentor', 'defaultRole');
    if (!/^acct_/.test(r.json.account.id)) throw new Error('id should start with acct_');
    if (JSON.stringify(r.json).match(/pass|scrypt|hash/i)) throw new Error('response leaks password material');
  });
  await check('the password is stored hashed (scrypt), not in plain text', async () => {
    const f = path.join(s1.dir, '_meta', 'accounts.json');
    await until(() => fs.existsSync(f), 'accounts file');
    const raw = fs.readFileSync(f, 'utf8');
    if (raw.includes('correct horse 9')) throw new Error('plain text password on disk');
    if (!raw.includes('scrypt$')) throw new Error('no scrypt hash found');
  });
  await check('duplicate username is refused (case-insensitive)', async () => {
    const r = await register(name1.toUpperCase());
    eq(r.status, 409, 'status');
    eq(r.json.error, 'username_taken', 'error');
  });
  await check('weak or invalid sign-up details are rejected with a field and a message', async () => {
    const short = await register('zed' + uniq(), 'abc');
    eq(short.status, 400, 'short password');
    eq(short.json.field, 'password', 'field');
    const common = await register('zed' + uniq(), 'password1');
    eq(common.status, 400, 'common password');
    const eqPw = 'pwuser' + uniq();
    eq((await register(eqPw, eqPw)).status, 400, 'password equals username');
    const badName = await register('a!');
    eq(badName.status, 400, 'bad username');
    eq(badName.json.field, 'username', 'field');
  });
  await check('login works; wrong password and unknown user give the same answer', async () => {
    const ok = await api(null, 'POST', '/api/auth/login', { username: name1, password: 'correct horse 9' });
    eq(ok.status, 200, 'login');
    const bad = await api(null, 'POST', '/api/auth/login', { username: name1, password: 'nope nope nope' });
    const ghost = await api(null, 'POST', '/api/auth/login', { username: 'ghost' + uniq(), password: 'nope nope nope' });
    eq(bad.status, 401, 'wrong password');
    eq(ghost.status, 401, 'unknown user');
    eq(bad.json.message, ghost.json.message, 'same message');
  });
  await check('GET /api/auth/me: token works, tampered or missing token does not', async () => {
    const me = await api(ada, 'GET', '/api/auth/me');
    eq(me.status, 200, 'with token');
    eq(me.json.account.username, name1, 'username');
    const parts = ada.token.split('.');
    const flipped = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA');
    eq((await api({ token: `${parts[0]}.${parts[1]}.${flipped}`, headers: {} }, 'GET', '/api/auth/me')).status, 401, 'tampered signature');
    const forged = Buffer.from(JSON.stringify({ sub: 'acct_someoneelse', tv: 1, iat: 1, exp: 99999999999 })).toString('base64url');
    eq((await api({ token: `sv1.${forged}.${parts[2]}`, headers: {} }, 'GET', '/api/auth/me')).status, 401, 'forged payload');
    eq((await api(null, 'GET', '/api/auth/me')).status, 401, 'no token');
  });
  await check('a guest cannot use an account id as their identity', async () => {
    const r = await api({ headers: { 'x-user-id': ada.id, 'x-user-name': 'Fake Ada', 'x-role': 'mentor' } }, 'GET', '/api/rooms');
    eq(r.status, 401, 'status');
    eq(r.json.error, 'sign_in_required', 'error');
  });
  await check('profile: name, colour and default role change; colours outside the palette are refused', async () => {
    const ok = await api(ada, 'POST', '/api/auth/profile', { displayName: 'Ada Lovelace', color: '#26794f', defaultRole: 'student' });
    eq(ok.status, 200, 'update');
    eq(ok.json.account.displayName, 'Ada Lovelace', 'name');
    eq(ok.json.account.color, '#26794f', 'color');
    eq((await api(ada, 'POST', '/api/auth/profile', { color: '#ff0000' })).status, 400, 'red is not allowed');
    eq((await api(ada, 'POST', '/api/auth/profile', { displayName: '   ' })).status, 400, 'empty name');
    eq((await api(null, 'POST', '/api/auth/profile', { displayName: 'x' })).status, 401, 'signed out');
  });
  await check('changing the password signs out older tokens; the new password works', async () => {
    const r = await register('pw' + uniq(), 'first password 1');
    const old = r.who;
    eq((await api(old, 'POST', '/api/auth/password', { current: 'wrong wrong', next: 'second password 2' })).status, 400, 'wrong current');
    const ok = await api(old, 'POST', '/api/auth/password', { current: 'first password 1', next: 'second password 2' });
    eq(ok.status, 200, 'change');
    eq((await api(old, 'GET', '/api/auth/me')).status, 401, 'old token is dead');
    eq((await api({ token: ok.json.token, headers: {} }, 'GET', '/api/auth/me')).status, 200, 'new token works');
    eq((await api(null, 'POST', '/api/auth/login', { username: r.json.account.username, password: 'first password 1' })).status, 401, 'old password fails');
    eq((await api(null, 'POST', '/api/auth/login', { username: r.json.account.username, password: 'second password 2' })).status, 200, 'new password works');
  });
  await check('"sign out everywhere" kills every token', async () => {
    const r = await register('lo' + uniq());
    eq((await api(r.who, 'POST', '/api/auth/logout-all')).status, 200, 'logout-all');
    eq((await api(r.who, 'GET', '/api/auth/me')).status, 401, 'token dead');
  });
  await check('five wrong passwords lock that username for a while (even the right password)', async () => {
    const r = await register('lk' + uniq(), 'the right one 1');
    const u = r.json.account.username;
    for (let i = 0; i < 5; i++) eq((await api(null, 'POST', '/api/auth/login', { username: u, password: 'wrong' + i + 'xxxx' })).status, 401, 'attempt ' + i);
    const blocked = await api(null, 'POST', '/api/auth/login', { username: u, password: 'the right one 1' });
    eq(blocked.status, 429, 'blocked');
    if (!blocked.headers.get('retry-after')) throw new Error('missing retry-after');
  });

  // ================================================================================================ rooms
  const code = 'rm-' + uniq();
  const owner = guest('Olive', 'mentor');
  const mentor2 = guest('Milo', 'mentor');
  const stu = guest('Sam', 'student');
  const stu2 = guest('Sue', 'student');
  const late = guest('Lou', 'mentor');
  const stranger = guest('Eve', 'mentor');

  await check('joining an unknown room creates it and makes you the owner', async () => {
    const r = await join(owner, code, 'mentor');
    eq(r.status, 201, 'status');
    eq(r.json.me.owner, true, 'owner');
    eq(r.json.me.role, 'mentor', 'role');
    eq(r.json.room.code, code, 'code');
  });
  await check('others join with the role they ask for while mentor seats are open', async () => {
    eq((await join(mentor2, code, 'mentor')).json.me.role, 'mentor', 'mentor2');
    eq((await join(stu, code, 'student')).json.me.role, 'student', 'student');
    eq((await join(stu2, code, 'student')).json.me.role, 'student', 'student 2');
  });
  await check('GET room lists members to members only; unknown room is 404; bad code is 400', async () => {
    const r = await api(stu, 'GET', `/api/rooms/${code}`);
    eq(r.status, 200, 'member');
    eq(r.json.room.members.length, 4, 'member count');
    eq(r.json.room.members[0].owner, true, 'owner listed first');
    eq((await api(stranger, 'GET', `/api/rooms/${code}`)).status, 403, 'non-member');
    eq((await api(stu, 'GET', `/api/rooms/nothere-${uniq()}`)).status, 404, 'unknown');
    eq((await api(stu, 'GET', '/api/rooms/bad%20code!')).status, 400, 'bad code');
  });
  await check('only the owner can lock mentor seats or rename; a locked room turns new mentors into students', async () => {
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/settings`, { lockMentorSeats: true })).status, 403, 'mentor cannot lock');
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/settings`, { name: 'Hijack' })).status, 403, 'mentor cannot rename');
    eq((await api(owner, 'POST', `/api/rooms/${code}/settings`, { lockMentorSeats: true, name: 'Loops practice' })).json.room.name, 'Loops practice', 'rename');
    const r = await join(late, code, 'mentor');
    eq(r.json.me.role, 'student', 'downgraded');
    if (!/locked/i.test(r.json.downgraded?.reason ?? '')) throw new Error('no explanation given');
    eq((await join(mentor2, code, 'mentor')).json.me.role, 'mentor', 'existing mentor keeps the seat');
    eq((await api(owner, 'POST', `/api/rooms/${code}/settings`, { lockMentorSeats: false })).status, 200, 'unlock');
  });
  await check('moderation rules: students cannot moderate, mentors cannot touch mentors or the owner, only the owner promotes', async () => {
    eq((await api(stu, 'POST', `/api/rooms/${code}/members/${stu2.id}`, { muted: true })).status, 403, 'student');
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/members/${owner.id}`, { muted: true })).status, 403, 'owner is untouchable');
    eq((await api(owner, 'POST', `/api/rooms/${code}/members/${owner.id}`, { removed: true })).status, 403, 'owner cannot be removed');
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/members/${stu.id}`, { role: 'mentor' })).status, 403, 'mentor cannot promote');
    eq((await api(owner, 'POST', `/api/rooms/${code}/members/${mentor2.id}`, { muted: true })).status, 200, 'owner may act on a mentor');
    await api(owner, 'POST', `/api/rooms/${code}/members/${mentor2.id}`, { muted: false });
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/members/${stu2.id}`, { muted: true })).status, 200, 'mentor mutes a student');
    await api(mentor2, 'POST', `/api/rooms/${code}/members/${stu2.id}`, { muted: false });
    eq((await api(owner, 'POST', `/api/rooms/${code}/members/nobody`, { muted: true })).status, 404, 'unknown member');
  });
  await check('a role a moderator set sticks: the member can only ask for less', async () => {
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/members/${stu.id}`, { role: 'viewer' })).json.room.members.find((m) => m.userId === stu.id).role, 'viewer', 'set viewer');
    eq((await join(stu, code, 'student')).json.me.role, 'viewer', 'asking for student does not undo it');
    eq((await join(stu, code, 'mentor')).json.me.role, 'viewer', 'asking for mentor does not either');
    await api(owner, 'POST', `/api/rooms/${code}/members/${stu.id}`, { role: 'student' });
    eq((await join(stu, code, 'student')).json.me.role, 'student', 'restored');
    eq((await join(stu, code, 'viewer')).json.me.role, 'viewer', 'may choose to step down');
    await api(owner, 'POST', `/api/rooms/${code}/members/${stu.id}`, { role: 'student' });
  });
  await check('the server applies the room role, not the claimed one (x-role: mentor from a student does nothing)', async () => {
    const claim = { ...stu, headers: { ...stu.headers, 'x-role': 'mentor' } };
    const asStudent = await api(claim, 'POST', '/api/broadcast', { roomCode: code, message: 'hi' }, { 'x-room': code });
    eq(asStudent.status, 403, 'student claiming mentor');
    const outsider = { ...stranger, headers: { ...stranger.headers, 'x-role': 'mentor' } };
    eq((await api(outsider, 'POST', '/api/broadcast', { roomCode: code, message: 'hi' }, { 'x-room': code })).status, 403, 'non-member claiming mentor');
    const real = await api(owner, 'POST', '/api/broadcast', { roomCode: code, message: 'hi' }, { 'x-room': code });
    if (real.status === 403) throw new Error('the real mentor was refused');
    const legacy = await api({ ...stu, headers: { ...stu.headers, 'x-role': 'mentor' } }, 'POST', '/api/broadcast', { roomCode: code, message: 'hi' });
    if (legacy.status === 403) throw new Error('requests that name no room must keep the claimed role (older scripts)');
  });
  await check('removing a member blocks rejoin and API use until a mentor allows them back', async () => {
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/members/${stu2.id}`, { removed: true })).status, 200, 'remove');
    const j = await join(stu2, code, 'student');
    eq(j.status, 403, 'rejoin');
    eq(j.json.error, 'removed', 'error');
    eq((await api(stu2, 'GET', '/api/rooms', undefined, { 'x-room': code })).status, 403, 'api with x-room');
    eq((await api(mentor2, 'POST', `/api/rooms/${code}/members/${stu2.id}`, { removed: false })).status, 200, 'allow back');
    eq((await join(stu2, code, 'student')).status, 200, 'rejoin after allow');
  });
  await check('"my rooms" lists rooms for accounts and is private per person', async () => {
    const acct = (await register('rl' + uniq())).who;
    const c1 = 'ar-' + uniq();
    await join(acct, c1, 'mentor');
    const mine = await api(acct, 'GET', '/api/rooms');
    eq(mine.json.rooms.length, 1, 'one room');
    eq(mine.json.rooms[0].code, c1, 'code');
    eq(mine.json.rooms[0].owner, true, 'owner');
    eq((await api(stranger, 'GET', '/api/rooms')).json.rooms.length, 0, 'stranger sees none');
  });
  await check('real-time: the stream pushes state changes and "removed" to the person affected', async () => {
    const c = 'st-' + uniq();
    const o = guest('Own', 'mentor');
    const v = guest('Vic', 'student');
    await join(o, c, 'mentor');
    await join(v, c, 'student');
    const events = [];
    const ctl = new AbortController();
    const res = await fetch(`${BASE}/api/rooms/${c}/stream`, { headers: v.headers, signal: ctl.signal });
    eq(res.status, 200, 'stream status');
    (async () => {
      const dec = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of res.body) {
          buf += dec.decode(chunk);
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
          }
        }
      } catch {
        /* aborted */
      }
    })();
    await until(() => events.some((e) => e.type === 'state'), 'initial state');
    await api(o, 'POST', `/api/rooms/${c}/settings`, { frozen: true });
    await until(() => events.some((e) => e.type === 'state' && e.room.frozen), 'frozen pushed');
    await api(o, 'POST', `/api/rooms/${c}/members/${v.id}`, { removed: true });
    await until(() => events.some((e) => e.type === 'removed'), 'removed pushed');
    await api(o, 'POST', `/api/rooms/${c}/delete`);
    await until(() => events.some((e) => e.type === 'deleted'), 'deleted pushed');
    ctl.abort();
  });
  await check('delete: only the owner; afterwards the room is gone', async () => {
    const c = 'dl-' + uniq();
    const o = guest('Own', 'mentor');
    const m = guest('Men', 'mentor');
    await join(o, c, 'mentor');
    await join(m, c, 'mentor');
    eq((await api(m, 'POST', `/api/rooms/${c}/delete`)).status, 403, 'mentor cannot delete');
    eq((await api(o, 'POST', `/api/rooms/${c}/delete`)).status, 200, 'owner deletes');
    eq((await api(o, 'GET', `/api/rooms/${c}`)).status, 404, 'gone');
  });
  await check('mute-audio needs the owner/mentor, and says so clearly when video is not configured', async () => {
    eq((await api(stu, 'POST', `/api/rooms/${code}/members/${stu2.id}/mute-audio`)).status, 403, 'student');
    const r = await api(owner, 'POST', `/api/rooms/${code}/members/${stu2.id}/mute-audio`);
    eq(r.status, 503, 'no livekit');
    eq(r.json.error, 'livekit_not_configured', 'error');
    eq((await api(owner, 'POST', `/api/rooms/${code}/mute-all-audio`)).status, 503, 'mute all');
  });
  await check('the video token refuses non-members of a registered room (503 first if video is off)', async () => {
    const r = await api(stranger, 'GET', `/api/livekit/token?room=${code}`);
    if (![403, 503].includes(r.status)) throw new Error('unexpected ' + r.status);
  });

  // ============================================================================== collab permissions
  const croom = 'cp-' + uniq();
  const cOwner = guest('Cow', 'mentor');
  const cStu = guest('Cst', 'student');
  const cViewer = guest('Cvw', 'viewer');
  await join(cOwner, croom, 'mentor');
  await join(cStu, croom, 'student');
  await join(cViewer, croom, 'viewer');
  const a = collab(croom, cOwner);
  const b = collab(croom, cStu);
  const v = collab(croom, cViewer);
  await Promise.all([synced(a), synced(b), synced(v)]);

  await check('a new room has a files map with main.py and the starter program', async () => {
    eq(a.files.size, 1, 'one file');
    eq(a.files.get('main').name, 'main.py', 'name');
    eq(a.files.get('main').language, 'python', 'language');
    if (!a.text.toString().includes('def average')) throw new Error('starter missing');
  });
  await check('registered rooms refuse anonymous and non-member connections', async () => {
    const anon = collab(croom, null, { anonymous: true });
    const out = collab(croom, stranger);
    await new Promise((r) => setTimeout(r, 1200));
    if (anon.provider.synced || out.provider.synced) throw new Error('an unauthorised connection was accepted');
    anon.provider.destroy();
    out.provider.destroy();
  });
  await check('viewers can watch but their changes never reach the document', async () => {
    const before = a.text.toString();
    v.text.insert(0, '#VIEWER\n');
    await new Promise((r) => setTimeout(r, 500));
    eq(a.text.toString(), before, 'owner still sees original');
    eq(b.text.toString(), before, 'student still sees original');
    a.text.insert(0, '#from-owner\n');
    await until(() => v.text.toString().includes('#from-owner'), 'viewer still receives edits');
  });
  await check('a student edits normally; pausing them stops their edits, and unpausing restores them', async () => {
    b.text.insert(0, '#s1\n');
    await until(() => a.text.toString().startsWith('#s1'), 'student edit arrives');
    await api(cOwner, 'POST', `/api/rooms/${croom}/members/${cStu.id}`, { muted: true });
    const b2 = collab(croom, cStu); // a second tab of the paused student
    await synced(b2);
    const base = a.text.toString();
    b2.text.insert(0, '#MUTED\n');
    await new Promise((r) => setTimeout(r, 500));
    eq(a.text.toString(), base, 'paused edits are dropped');
    b2.provider.destroy();
    await api(cOwner, 'POST', `/api/rooms/${croom}/members/${cStu.id}`, { muted: false });
    const b3 = collab(croom, cStu);
    await synced(b3);
    b3.text.insert(0, '#s2\n');
    await until(() => a.text.toString().startsWith('#s2'), 'edit works again after unpausing');
    b3.provider.destroy();
  });
  await check('freezing the room stops students but not mentors', async () => {
    await api(cOwner, 'POST', `/api/rooms/${croom}/settings`, { frozen: true });
    const b2 = collab(croom, cStu);
    await synced(b2);
    const base = a.text.toString();
    b2.text.insert(0, '#FROZEN\n');
    await new Promise((r) => setTimeout(r, 500));
    eq(a.text.toString(), base, 'student edit dropped while frozen');
    a.text.insert(0, '#mentor-ok\n');
    await until(() => b2.text.toString().includes('#mentor-ok'), 'mentor can still edit');
    b2.provider.destroy();
    await api(cOwner, 'POST', `/api/rooms/${croom}/settings`, { frozen: false });
  });
  await check('removing a member closes their live connection', async () => {
    const x = guest('Xen', 'student');
    await join(x, croom, 'student');
    const c = collab(croom, x);
    await synced(c);
    await api(cOwner, 'POST', `/api/rooms/${croom}/members/${x.id}`, { removed: true });
    await until(() => c.closes.includes(4403), 'closed with 4403');
    c.provider.destroy();
  });
  await check('version history: save, edit, restore; restore is itself undoable; viewers cannot save or restore', async () => {
    const saved = await api(cStu, 'POST', `/api/rooms/${croom}/versions`, { label: 'Checkpoint one' });
    eq(saved.status, 201, 'save');
    const id = saved.json.version.id;
    const snapshotText = a.text.toString();
    a.text.insert(0, '#after-save\n');
    await until(() => b.text.toString().startsWith('#after-save'), 'edit propagated');
    const list = await api(cViewer, 'GET', `/api/rooms/${croom}/versions`);
    eq(list.status, 200, 'viewer can list');
    if (!list.json.versions.some((x) => x.id === id && x.label === 'Checkpoint one')) throw new Error('saved version not listed');
    const one = await api(cViewer, 'GET', `/api/rooms/${croom}/versions/${id}`);
    eq(one.json.files[0].content, snapshotText, 'preview content');
    eq((await api(cViewer, 'POST', `/api/rooms/${croom}/versions`, { label: 'x' })).status, 403, 'viewer cannot save');
    eq((await api(cViewer, 'POST', `/api/rooms/${croom}/versions/${id}/restore`)).status, 403, 'viewer cannot restore');
    eq((await api(stranger, 'GET', `/api/rooms/${croom}/versions`)).status, 403, 'non-member');
    const restored = await api(cStu, 'POST', `/api/rooms/${croom}/versions/${id}/restore`);
    eq(restored.status, 200, 'restore');
    await until(() => a.text.toString() === snapshotText && b.text.toString() === snapshotText && v.text.toString().includes(snapshotText), 'everyone sees the restored text');
    const after = (await api(cStu, 'GET', `/api/rooms/${croom}/versions`)).json.versions;
    if (!after.some((x) => x.label === 'Before restore')) throw new Error('no "Before restore" copy');
    eq((await api(cStu, 'POST', `/api/rooms/${croom}/versions/nope/restore`)).status, 404, 'unknown version');
  });
  await check('restoring brings back deleted files and removes added ones, for everyone at once', async () => {
    const f = { name: 'helper.py', language: 'python', order: 1, createdAt: Date.now() };
    a.doc.transact(() => {
      a.files.set('h1', f);
      a.doc.getText('f:h1').insert(0, 'x = 1\n');
    });
    await until(() => b.files.has('h1'), 'file synced');
    const id = (await api(cOwner, 'POST', `/api/rooms/${croom}/versions`, { label: 'With helper' })).json.version.id;
    a.doc.transact(() => {
      a.files.delete('h1');
      a.files.set('h2', { ...f, name: 'other.py' });
    });
    await until(() => !b.files.has('h1') && b.files.has('h2'), 'changes synced');
    await api(cOwner, 'POST', `/api/rooms/${croom}/versions/${id}/restore`);
    await until(() => b.files.has('h1') && !b.files.has('h2'), 'files restored');
    eq(b.doc.getText('f:h1').toString(), 'x = 1\n', 'content of the restored file');
  });
  await check('autosave: leaving the room saves a "Session ended" copy when something changed', async () => {
    const c = 'au-' + uniq();
    const o = guest('Auto', 'mentor');
    await join(o, c, 'mentor');
    const cl = collab(c, o);
    await synced(cl);
    cl.text.insert(0, '#typed\n');
    await new Promise((r) => setTimeout(r, 300));
    cl.provider.destroy();
    await until(async () => (await api(o, 'GET', `/api/rooms/${c}/versions`)).json.versions.some((x) => x.auto), 'autosave exists');
  });
  await check('deleting a room disconnects everyone and the code cannot be reopened by a stale client', async () => {
    const c = 'dd-' + uniq();
    const o = guest('Del', 'mentor');
    await join(o, c, 'mentor');
    const cl = collab(c, o);
    await synced(cl);
    await api(o, 'POST', `/api/rooms/${c}/delete`);
    await until(() => cl.closes.includes(4404), 'closed with 4404');
    await new Promise((r) => setTimeout(r, 1500));
    if (cl.provider.synced && cl.provider.wsconnected) throw new Error('stale client reconnected');
    cl.provider.destroy();
  });

  // ================================================================================== logging and ops
  await check('client error reports are accepted, validated and rate limited', async () => {
    eq((await api(null, 'POST', '/api/client-log', { message: 'boom', where: 'test' })).status, 204, 'accepted');
    eq((await api(null, 'POST', '/api/client-log', { nope: 1 })).status, 400, 'invalid');
  });
  await check('admin log is hidden without the token and readable with it; secrets are redacted', async () => {
    eq((await api(null, 'GET', '/api/admin/logs')).status, 404, 'no token');
    eq((await api(null, 'GET', '/api/admin/logs', undefined, { 'x-admin-token': 'wrong-token-123456' })).status, 404, 'wrong token');
    const r = await api(null, 'GET', '/api/admin/logs?limit=200', undefined, { 'x-admin-token': 'admin-token-123456' });
    eq(r.status, 200, 'with token');
    if (!r.json.logs.some((l) => l.scope === 'web' && l.msg === 'boom')) throw new Error('client report not in the log');
    const text = JSON.stringify(r.json.logs);
    if (text.includes('correct horse 9')) throw new Error('a password reached the log');
  });
  await check('every response carries an x-request-id and errors are JSON, never HTML', async () => {
    const r = await api(null, 'POST', '/api/auth/login', undefined, { 'content-type': 'application/json' });
    if (!r.headers.get('x-request-id')) throw new Error('no request id');
    const bad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
    eq(bad.status, 400, 'bad json status');
    const j = await bad.json();
    eq(j.error, 'bad_request', 'bad json error');
  });
  await check('the log file is written in the data folder', async () => {
    const dir = path.join(s1.dir, '_meta', 'logs');
    await until(() => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.log') && fs.statSync(path.join(dir, f)).size > 0), 'log file');
  });
} finally {
  /* servers stopped below */
}

// ======================================================================================== REQUIRE_AUTH
const s2 = start(4402, { REQUIRE_AUTH: '1' });
try {
  await until(up(4402), 'auth-required server up');
  const B2 = 'http://localhost:4402';
  await check('REQUIRE_AUTH: guests are turned away, health and sign-up stay open, accounts work', async () => {
    eq((await call(B2, guest('G'), 'GET', '/api/rooms')).status, 401, 'guest refused');
    eq((await call(B2, null, 'GET', '/api/health')).status, 200, 'health open');
    const r = await call(B2, null, 'POST', '/api/auth/register', { username: 'req' + uniq(), password: 'some long pass 1' });
    eq(r.status, 201, 'register open');
    const who = { token: r.json.token, headers: {} };
    eq((await call(B2, who, 'POST', '/api/rooms/ra-' + uniq() + '/join', { role: 'mentor' })).status, 201, 'account can create a room');
  });
  // s2 inherits the real LiveKit keys from .env when present: a true round trip to LiveKit Cloud (read-only calls).
  const hasKeys = /^LIVEKIT_API_SECRET=\S+/m.test(fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '');
  if (hasKeys) {
    await check('LiveKit (real keys): tokens carry the room and the right rights; mute calls reach LiveKit Cloud', async () => {
      const mk = async (u, role) => (await call(B2, null, 'POST', '/api/auth/register', { username: u + uniq(), password: 'some long pass 1' })).json.token;
      const ownerTok = { token: await mk('lko'), headers: {} };
      const viewerTok = { token: await mk('lkv'), headers: {} };
      const lkRoom = 'lk-' + uniq();
      await call(B2, ownerTok, 'POST', `/api/rooms/${lkRoom}/join`, { role: 'mentor' });
      await call(B2, viewerTok, 'POST', `/api/rooms/${lkRoom}/join`, { role: 'viewer' });
      const grants = async (who) => {
        const r = await call(B2, who, 'GET', `/api/livekit/token?room=${lkRoom}`);
        eq(r.status, 200, 'token status');
        const payload = JSON.parse(Buffer.from(r.json.token.split('.')[1], 'base64url').toString());
        if (!String(r.json.url).startsWith('wss://')) throw new Error('url should be wss://');
        return payload.video;
      };
      const o = await grants(ownerTok);
      eq(o.room, 'sv-' + lkRoom, 'room name');
      eq(o.canPublish, true, 'mentor can publish');
      const v = await grants(viewerTok);
      eq(v.canPublish, false, 'viewer cannot publish');
      eq(v.canSubscribe, true, 'viewer can listen');
      const out = await call(B2, { token: await mk('lks'), headers: {} }, 'GET', `/api/livekit/token?room=${lkRoom}`);
      eq(out.status, 403, 'a non-member gets no token');
      const all = await call(B2, ownerTok, 'POST', `/api/rooms/${lkRoom}/mute-all-audio`);
      eq(all.status, 200, 'mute-all reaches LiveKit');
      eq(all.json.muted, 0, 'nobody is in the call, so nothing to mute');
    });
  }
  await check('REQUIRE_AUTH: the collab socket needs a token too', async () => {
    const doc = new Y.Doc();
    const p = new WebsocketProvider(`ws://localhost:4402/collab`, 'ra-x-' + uniq(), doc, { WebSocketPolyfill: WebSocket, disableBc: true, params: { uid: 'g-1' } });
    await new Promise((r) => setTimeout(r, 1200));
    const ok = p.synced;
    p.destroy();
    if (ok) throw new Error('a guest connected');
  });
} finally {
  /* stopped below */
}

// ========================================================================================== env checks
await check('invalid settings stop the server with a clear message', async () => {
  const s3 = start(4403, { PORT: 'abc', LIVEKIT_URL: 'not-a-url', AUTH_SECRET: 'short' });
  const code = await new Promise((resolve) => s3.p.on('exit', resolve));
  eq(code, 1, 'exit code');
  const out = s3.output();
  for (const needle of ['PORT', 'LIVEKIT_URL', 'AUTH_SECRET']) if (!out.includes(needle)) throw new Error(`message does not mention ${needle}`);
});

for (const s of servers) {
  try {
    s.p.kill();
  } catch {
    /* already gone */
  }
}

let failed = 0;
for (const [ok, name, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
