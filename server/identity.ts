/**
 * Who is calling. Owner: Lane A.
 *
 * Two kinds of caller:
 *  - SIGNED IN: `Authorization: Bearer <token>` (or ?token= for EventSource). The account is the identity; headers are ignored.
 *  - GUEST: x-user-id / x-user-name / x-role headers (or ?uid=&uname=&urole=). Not proven by anything, so a guest cannot use an
 *    account's id, and REQUIRE_AUTH=1 turns guests away entirely.
 * Roles are VERIFIED whenever the request names a room (x-room header or ?uroom=) that has a registry entry: a member gets the
 * role the room recorded for them, whatever the header claims; a non-member can never be more than a student; a removed member
 * is refused. Requests that name no room (older scripts, /api/health) keep the claimed mentor/student role.
 */
import type { NextFunction, Request, Response } from 'express';
import { HEADER_ROLE, HEADER_ROOM, HEADER_USER_ID, HEADER_USER_NAME, type Role } from '@syncverse/shared';
import { accountFromToken, isAccountId } from './auth';
import { accountsRequired } from './env';
import { isRegistered, memberOf } from './roomstore';

export interface RequestUser {
  userId: string;
  name: string;
  role: Role;
  /** true when the caller proved who they are with an account token */
  account: boolean;
  /** the room this request is about, when it named a registered one and the caller belongs to it */
  room?: string;
  owner?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

function queryString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

const claimed = (raw: string | undefined): Role => (raw === 'mentor' ? 'mentor' : raw === 'viewer' ? 'viewer' : 'student');

const OPEN_PATHS = [/^\/api\/health$/, /^\/api\/auth\//, /^\/api\/client-log$/];

export function identity(req: Request, res: Response, next: NextFunction): void {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '')?.[1] ?? queryString(req.query.token);
  let userId: string | undefined;
  let name: string | undefined;
  let role: Role;
  let isAccount = false;

  if (bearer) {
    const acct = accountFromToken(bearer);
    if (!acct) {
      res.status(401).json({ error: 'invalid_token', message: 'Your sign-in expired. Sign in again.' });
      return;
    }
    req.account = acct;
    userId = acct.id;
    name = acct.displayName;
    role = claimed(req.header(HEADER_ROLE) ?? queryString(req.query.urole) ?? acct.defaultRole);
    isAccount = true;
  } else {
    // Headers for fetch(); query (?uid=&uname=&urole=) for EventSource, which cannot set headers.
    userId = req.header(HEADER_USER_ID) ?? queryString(req.query.uid);
    if (userId && isAccountId(userId)) {
      res.status(401).json({ error: 'sign_in_required', message: 'That identity belongs to an account. Sign in to use it.' });
      return;
    }
    if (accountsRequired() && !OPEN_PATHS.some((p) => p.test(req.path))) {
      res.status(401).json({ error: 'account_required', message: 'This server only accepts signed-in users. Sign in to continue.' });
      return;
    }
    name = req.header(HEADER_USER_NAME) ?? queryString(req.query.uname) ?? 'Guest';
    role = claimed(req.header(HEADER_ROLE) ?? queryString(req.query.urole));
  }

  if (!userId) return next();

  const room = (req.header(HEADER_ROOM) ?? queryString(req.query.uroom))?.toLowerCase();
  const user: RequestUser = { userId, name: name ?? 'Guest', role, account: isAccount };
  if (room && isRegistered(room)) {
    const m = memberOf(room, userId);
    if (m?.removed) {
      res.status(403).json({ error: 'removed', message: 'You were removed from this room.' });
      return;
    }
    if (m) {
      user.role = m.role;
      user.room = room;
      user.owner = m.owner;
    } else if (user.role === 'mentor') {
      user.role = 'student'; // not a member of the room it is asking about: never trusted as a mentor
    }
  }
  req.user = user;
  next();
}

/** Use as a route guard: `router.post('/x', requireUser, handler)`. Inside the handler, `req.user!` is set. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'missing x-user-id header' });
    return;
  }
  next();
}
