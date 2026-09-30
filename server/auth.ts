/**
 * Accounts and profiles. Owner: Lane A.
 *
 *   POST /api/auth/register   { username, password, displayName?, defaultRole? }  -> { token, account }
 *   POST /api/auth/login      { username, password }                              -> { token, account }
 *   GET  /api/auth/me                                                              -> { account }
 *   POST /api/auth/profile    { displayName?, color?, defaultRole? }               -> { account }
 *   POST /api/auth/password   { current, next }                                    -> { token, account }  (signs out other devices)
 *   POST /api/auth/logout-all                                                      -> { ok }              (signs out every device)
 *
 * Passwords: scrypt with a per-account salt. Sessions: a signed token (HMAC-SHA256) valid 30 days, sent as
 * `Authorization: Bearer <token>`. The signing secret is AUTH_SECRET, or a random one created once in the data folder.
 * Accounts live in <data>/accounts.json (git-ignored). Guests (no account) still work unless REQUIRE_AUTH=1.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { PEOPLE_COLORS, type AccountProfile } from '@syncverse/shared';
import { dataDir } from './paths';
import { logger } from './logger';

const log = logger('auth');
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;

interface Account extends AccountProfile {
  passHash: string;
  /** Bumped on password change / "sign out everywhere": older tokens stop working. */
  tokenVersion: number;
  lastLoginAt: number;
}

const TOKEN_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

// -------------------------------------------------------------------------------------------- storage
let accounts: Map<string, Account> | null = null; // by id
let byName = new Map<string, string>(); // username -> id

const accountsFile = () => path.join(dataDir(), 'accounts.json');

function load(): Map<string, Account> {
  if (accounts) return accounts;
  accounts = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(accountsFile(), 'utf8')) as { accounts?: Account[] };
    for (const a of raw.accounts ?? []) {
      accounts.set(a.id, a);
      byName.set(a.username, a.id);
    }
  } catch {
    /* first run */
  }
  return accounts;
}

function persist(): void {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = accountsFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ accounts: [...load().values()] }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, accountsFile());
  } catch (err) {
    log.error('could not save accounts', err);
  }
}

export const publicAccount = (a: Account): AccountProfile => ({
  id: a.id,
  username: a.username,
  displayName: a.displayName,
  color: a.color,
  defaultRole: a.defaultRole,
  createdAt: a.createdAt,
});

export const isAccountId = (id: string): boolean => id.startsWith('acct_');
export const getAccount = (id: string): AccountProfile | undefined => {
  const a = load().get(id);
  return a ? publicAccount(a) : undefined;
};
export const accountCount = (): number => load().size;

// ----------------------------------------------------------------------------------------------- tokens
let secretCache: Buffer | null = null;
function secret(): Buffer {
  if (secretCache) return secretCache;
  if (process.env.AUTH_SECRET) return (secretCache = Buffer.from(process.env.AUTH_SECRET));
  const file = path.join(dataDir(), 'auth.secret');
  try {
    secretCache = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    if (secretCache.length >= 32) return secretCache;
  } catch {
    /* create below */
  }
  secretCache = crypto.randomBytes(32);
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file, secretCache.toString('hex'), { mode: 0o600 });
  log.info('created a new signing secret', { file });
  return secretCache;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (body: string) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

function issueToken(a: Account): string {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ sub: a.id, tv: a.tokenVersion, iat: now, exp: now + TOKEN_DAYS * 86400 }));
  return `sv1.${body}.${sign(body)}`;
}

/** Returns the account behind a valid, unexpired, not-revoked token; null otherwise. */
export function accountFromToken(token: string): AccountProfile | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'sv1') return null;
  const expected = Buffer.from(sign(parts[1]));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub: string; tv: number; exp: number };
    if (p.exp < Date.now() / 1000) return null;
    const a = load().get(p.sub);
    return a && a.tokenVersion === p.tv ? publicAccount(a) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------ passwords
async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const got = await scrypt(pw, Buffer.from(salt, 'hex'), 64, { N: Number(n), r: Number(r), p: Number(p) });
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

let dummyHash: Promise<string> | null = null; // burned on unknown usernames so timing does not reveal which exist

const WEAK = new Set(['password', 'password1', '12345678', '123456789', 'qwertyui', 'qwerty123', 'iloveyou', '11111111', 'abcd1234', 'letmein1']);

// ------------------------------------------------------------------------------------------- validation
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{2,23}$/, 'Username: 3 to 24 letters, numbers, dots, dashes or underscores.');
const displayName = z.string().trim().min(1, 'Enter the name others should see.').max(40, 'Names can be at most 40 characters.');
const newPassword = (user?: string) =>
  z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(128, 'Use at most 128 characters.')
    .refine((p) => !WEAK.has(p.toLowerCase()), 'That password is too common. Pick another.')
    .refine((p) => !user || p.toLowerCase() !== user, 'The password cannot be your username.');
const role = z.enum(['student', 'mentor']);
const color = z.enum(PEOPLE_COLORS);

function invalid(res: import('express').Response, err: z.ZodError): void {
  const issue = err.issues[0];
  res.status(400).json({ error: 'invalid', field: String(issue.path[0] ?? ''), message: issue.message });
}

// ------------------------------------------------------------------------------------------ rate limit
const fails = new Map<string, { n: number; since: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;
const MAX_SIGNUPS = 30; // per address per window

function limited(key: string, max = MAX_FAILS): number {
  const f = fails.get(key);
  if (!f) return 0;
  if (Date.now() - f.since > WINDOW_MS) {
    fails.delete(key);
    return 0;
  }
  return f.n >= max ? Math.ceil((f.since + WINDOW_MS - Date.now()) / 1000) : 0;
}
function noteFail(key: string): void {
  const f = fails.get(key);
  if (!f || Date.now() - f.since > WINDOW_MS) fails.set(key, { n: 1, since: Date.now() });
  else f.n++;
}

const ipOf = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

// ------------------------------------------------------------------------------------------------ routes
export const router = Router();

router.post('/auth/register', async (req, res) => {
  const parsed = z
    .object({ username, password: z.string(), displayName: displayName.optional(), defaultRole: role.optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) return void invalid(res, parsed.error);
  const { username: name, password } = parsed.data;
  const pw = newPassword(name).safeParse(password);
  if (!pw.success) return void res.status(400).json({ error: 'invalid', field: 'password', message: pw.error.issues[0].message });
  const key = `reg|${ipOf(req)}`;
  if (limited(key, MAX_SIGNUPS)) return void res.status(429).json({ error: 'rate_limited', message: 'Too many sign-up attempts. Try again in a few minutes.' });
  if (byName.has(name)) return void res.status(409).json({ error: 'username_taken', field: 'username', message: 'That username is taken.' });

  load();
  const acct: Account = {
    id: 'acct_' + crypto.randomBytes(9).toString('base64url'),
    username: name,
    displayName: parsed.data.displayName ?? name,
    color: PEOPLE_COLORS[crypto.randomInt(PEOPLE_COLORS.length)],
    defaultRole: parsed.data.defaultRole ?? 'student',
    createdAt: Date.now(),
    passHash: await hashPassword(password),
    tokenVersion: 1,
    lastLoginAt: Date.now(),
  };
  if (byName.has(name)) return void res.status(409).json({ error: 'username_taken', field: 'username', message: 'That username is taken.' }); // raced while hashing
  load().set(acct.id, acct);
  byName.set(name, acct.id);
  persist();
  noteFail(key); // registrations count toward the same small limit so one address cannot mass-create accounts
  log.info('account created', { id: acct.id, username: name });
  res.status(201).json({ token: issueToken(acct), account: publicAccount(acct) });
});

router.post('/auth/login', async (req, res) => {
  const parsed = z.object({ username, password: z.string().min(1).max(128) }).safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(401).json({ error: 'bad_credentials', message: 'Wrong username or password.' });
  const name = parsed.data.username;
  const keys = [`login|${ipOf(req)}|${name}`, `login|*|${name}`];
  const wait = Math.max(...keys.map((k) => limited(k)));
  if (wait) {
    res.setHeader('retry-after', String(wait));
    return void res.status(429).json({ error: 'rate_limited', message: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute(s).` });
  }
  const id = byName.get(name);
  const acct = id ? load().get(id) : undefined;
  dummyHash ??= hashPassword('not-a-real-password');
  const ok = await verifyPassword(parsed.data.password, acct?.passHash ?? (await dummyHash));
  if (!acct || !ok) {
    keys.forEach(noteFail);
    log.warn('failed login', { username: name });
    return void res.status(401).json({ error: 'bad_credentials', message: 'Wrong username or password.' });
  }
  keys.forEach((k) => fails.delete(k));
  acct.lastLoginAt = Date.now();
  persist();
  res.json({ token: issueToken(acct), account: publicAccount(acct) });
});

function current(req: Request): Account | undefined {
  return req.account ? load().get(req.account.id) : undefined;
}

router.get('/auth/me', (req, res) => {
  if (!req.account) return void res.status(401).json({ error: 'not_signed_in', message: 'Sign in to continue.' });
  res.json({ account: req.account });
});

router.post('/auth/profile', (req, res) => {
  const a = current(req);
  if (!a) return void res.status(401).json({ error: 'not_signed_in', message: 'Sign in to continue.' });
  const parsed = z.object({ displayName: displayName.optional(), color: color.optional(), defaultRole: role.optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return void invalid(res, parsed.error);
  Object.assign(a, Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)));
  persist();
  res.json({ account: publicAccount(a) });
});

router.post('/auth/password', async (req, res) => {
  const a = current(req);
  if (!a) return void res.status(401).json({ error: 'not_signed_in', message: 'Sign in to continue.' });
  const body = z.object({ current: z.string(), next: z.string() }).safeParse(req.body ?? {});
  if (!body.success) return void invalid(res, body.error);
  const key = `pw|${a.id}`;
  if (limited(key)) return void res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' });
  if (!(await verifyPassword(body.data.current, a.passHash))) {
    noteFail(key);
    return void res.status(400).json({ error: 'invalid', field: 'current', message: 'Your current password is not right.' });
  }
  const pw = newPassword(a.username).safeParse(body.data.next);
  if (!pw.success) return void res.status(400).json({ error: 'invalid', field: 'next', message: pw.error.issues[0].message });
  a.passHash = await hashPassword(body.data.next);
  a.tokenVersion++;
  persist();
  log.info('password changed', { id: a.id });
  res.json({ token: issueToken(a), account: publicAccount(a) });
});

router.post('/auth/logout-all', (req, res) => {
  const a = current(req);
  if (!a) return void res.status(401).json({ error: 'not_signed_in', message: 'Sign in to continue.' });
  a.tokenVersion++;
  persist();
  res.json({ ok: true });
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      account?: AccountProfile;
    }
  }
}
