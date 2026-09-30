/**
 * Tiny fetch helper that adds the prototype identity headers. EVERY lane calls the server through this.
 * Owner: Lane A.
 *
 *   const run = await api.post<{ id: string }>('/api/run', { roomCode, language: 'python', source, stdin });
 *   const r   = await api.get<RunResult>('/api/run/' + id);
 *
 * Throws ApiError for non-2xx responses (err.status, err.body) so callers can show a message.
 */
import { HEADER_ROLE, HEADER_USER_ID, HEADER_USER_NAME } from '@syncverse/shared';
import { readSession } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
}

function identityHeaders(): Record<string, string> {
  const s = readSession();
  if (!s) return {};
  return { [HEADER_USER_ID]: s.userId, [HEADER_USER_NAME]: s.name, [HEADER_ROLE]: s.role };
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
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
};

/** Server-sent events with identity. EventSource cannot set headers, so identity goes in the query string. */
export function eventSourceUrl(path: string): string {
  const s = readSession();
  if (!s) return path;
  const q = new URLSearchParams({ uid: s.userId, uname: s.name, urole: s.role });
  return `${path}${path.includes('?') ? '&' : '?'}${q.toString()}`;
}
