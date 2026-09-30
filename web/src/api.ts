/**
 * Tiny fetch helper that adds the caller's identity. EVERY lane calls the server through this.
 * Owner: Lane A.
 *
 *   const run = await api.post<{ id: string }>('/api/run', { roomCode, language: 'python', source, stdin });
 *   const r   = await api.get<RunResult>('/api/run/' + id);
 *
 * Identity: a signed-in account sends its token; a guest sends x-user-id / x-user-name. Both also send x-role and x-room, and the
 * server replaces the claimed role with the one the room recorded for that person.
 * Throws ApiError for non-2xx responses (err.status, err.body) so callers can show a message.
 */
import { HEADER_ROLE, HEADER_ROOM, HEADER_USER_ID, HEADER_USER_NAME } from '@syncverse/shared';
import { getToken, isAccountId, signOut } from './auth';
import { readSession } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
}

/** The token is only used when this tab is (or is about to be) signed in: a guest tab stays a guest even if another tab has an account. */
function tokenFor(sessionUserId?: string): string | null {
  const t = getToken();
  return t && (!sessionUserId || isAccountId(sessionUserId)) ? t : null;
}

function identityHeaders(): Record<string, string> {
  const s = readSession();
  const token = tokenFor(s?.userId);
  const h: Record<string, string> = {};
  if (token) h.authorization = `Bearer ${token}`;
  if (s) {
    if (!token) {
      h[HEADER_USER_ID] = s.userId;
      h[HEADER_USER_NAME] = s.name;
    }
    h[HEADER_ROLE] = s.role;
    h[HEADER_ROOM] = s.roomCode;
  }
  return h;
}

/** Identity as URL parameters, for things that cannot set headers: EventSource and the collaboration WebSocket. */
export function identityParams(): Record<string, string> {
  const s = readSession();
  const token = tokenFor(s?.userId);
  if (token) return { token, urole: s?.role ?? 'student', ...(s ? { uroom: s.roomCode } : {}) };
  if (!s) return {};
  return { uid: s.userId, uname: s.name, urole: s.role, uroom: s.roomCode };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...identityHeaders(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    // A dead or revoked sign-in: clear it so the app can send the person back to the start instead of failing quietly.
    if (res.status === 401 && (parsed as { error?: string } | null)?.error === 'invalid_token') signOut();
    throw new ApiError(res.status, parsed);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
};

/** A readable message from any thrown error (server messages are already written for people). */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof ApiError) {
    const m = (e.body as { message?: string } | null)?.message;
    if (m) return m;
    return e.status === 0 || e.status >= 500 ? 'The server could not do that right now. Try again in a moment.' : fallback;
  }
  return e instanceof TypeError ? 'Could not reach the server. Check your connection.' : fallback;
}

/** Server-sent events with identity. EventSource cannot set headers, so identity goes in the query string. */
export function eventSourceUrl(path: string): string {
  const q = new URLSearchParams(identityParams());
  return q.size ? `${path}${path.includes('?') ? '&' : '?'}${q.toString()}` : path;
}
