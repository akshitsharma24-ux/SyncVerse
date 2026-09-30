/**
 * Prototype identity: no login. The web app sends x-user-id / x-user-name / x-role on every request.
 * The server TRUSTS these headers. Acceptable for tonight's prototype; say so if asked.
 * Owner: Lane A.
 */
import type { NextFunction, Request, Response } from 'express';
import { HEADER_ROLE, HEADER_USER_ID, HEADER_USER_NAME, type Role } from '@syncverse/shared';

export interface RequestUser {
  userId: string;
  name: string;
  role: Role;
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

export function identity(req: Request, _res: Response, next: NextFunction): void {
  // Headers for fetch(); query (?uid=&uname=&urole=) for EventSource, which cannot set headers.
  const userId = req.header(HEADER_USER_ID) ?? queryString(req.query.uid);
  if (userId) {
    const roleRaw = req.header(HEADER_ROLE) ?? queryString(req.query.urole);
    const name = req.header(HEADER_USER_NAME) ?? queryString(req.query.uname) ?? 'Guest';
    req.user = { userId, name, role: roleRaw === 'mentor' ? 'mentor' : 'student' };
  }
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
