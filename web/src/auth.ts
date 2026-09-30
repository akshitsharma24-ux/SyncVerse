/**
 * Accounts (client side). Owner: Lane A.
 *
 * Signing in is optional: guests still work. The session token lives in localStorage ('sv.auth'), so a login survives
 * closing the browser and is shared by every tab; a guest tab stays a guest. Other lanes do not need this file:
 * web/src/api.ts adds the right identity (token or guest headers) to every request for them.
 *
 *   const auth = useAuth();          // { account, token, ready }
 *   await signIn('ada', 'password');  await register({ username, password, displayName, defaultRole });  signOut();
 */
import { useSyncExternalStore } from 'react';
import type { AccountProfile, Role } from '@syncverse/shared';

const KEY = 'sv.auth';

export interface AuthState {
  token: string | null;
  account: AccountProfile | null;
  /** false until a saved login has been checked with the server (a brief moment after the page loads) */
  ready: boolean;
}

function read(): AuthState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { token?: string; account?: AccountProfile };
      if (v.token && v.account) return { token: v.token, account: v.account, ready: false };
    }
  } catch {
    /* no storage: guest */
  }
  return { token: null, account: null, ready: true };
}

let state: AuthState = read();
const listeners = new Set<() => void>();

function set(next: AuthState): void {
  state = next;
  try {
    if (next.token && next.account) localStorage.setItem(KEY, JSON.stringify({ token: next.token, account: next.account }));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const getToken = (): string | null => state.token;
export const getAccount = (): AccountProfile | null => state.account;
export const isAccountId = (id: string): boolean => id.startsWith('acct_');

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

export type AuthResult = { ok: true } | { ok: false; field?: string; message: string };

async function call(path: string, body: unknown, token?: string | null): Promise<{ status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } catch {
    return { status: 0, json: { message: 'Could not reach the server. Check your connection and try again.' } };
  }
}

function failure(r: { status: number; json: Record<string, unknown> }): AuthResult {
  return { ok: false, field: typeof r.json.field === 'string' ? r.json.field : undefined, message: typeof r.json.message === 'string' ? r.json.message : 'Something went wrong. Try again.' };
}

function accept(r: { status: number; json: Record<string, unknown> }): AuthResult {
  if (r.status >= 200 && r.status < 300 && typeof r.json.token === 'string') {
    set({ token: r.json.token, account: r.json.account as AccountProfile, ready: true });
    return { ok: true };
  }
  return failure(r);
}

export async function signIn(username: string, password: string): Promise<AuthResult> {
  return accept(await call('/api/auth/login', { username, password }));
}

export async function register(input: { username: string; password: string; displayName?: string; defaultRole?: Exclude<Role, 'viewer'> }): Promise<AuthResult> {
  return accept(await call('/api/auth/register', input));
}

export function signOut(): void {
  set({ token: null, account: null, ready: true });
}

export async function signOutEverywhere(): Promise<void> {
  await call('/api/auth/logout-all', {}, state.token);
  signOut();
}

export async function updateProfile(patch: { displayName?: string; color?: string; defaultRole?: Exclude<Role, 'viewer'> }): Promise<AuthResult> {
  const r = await call('/api/auth/profile', patch, state.token);
  if (r.status === 200 && state.token) {
    set({ token: state.token, account: r.json.account as AccountProfile, ready: true });
    return { ok: true };
  }
  if (r.status === 401) signOut();
  return failure(r);
}

export async function changePassword(current: string, next: string): Promise<AuthResult> {
  return accept(await call('/api/auth/password', { current, next }, state.token));
}

/** Check a saved login with the server once at startup; a dead token signs you out quietly. */
export async function initAuth(): Promise<void> {
  if (typeof window !== 'undefined') {
    // another tab signed in or out: follow it
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) set({ ...read(), ready: true });
    });
  }
  if (!state.token) return;
  try {
    const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${state.token}` } });
    if (res.ok) {
      const j = (await res.json()) as { account: AccountProfile };
      set({ token: state.token, account: j.account, ready: true });
    } else if (res.status === 401) {
      signOut();
    } else {
      set({ ...state, ready: true }); // server trouble: keep the login and try again later
    }
  } catch {
    set({ ...state, ready: true });
  }
}
