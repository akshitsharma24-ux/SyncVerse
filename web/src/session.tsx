/**
 * Shared React contexts and hooks. Owner: Lane A. After P-A1 other lanes only IMPORT from here.
 *
 *   useSession()    -> { session, join, leave }         who am I, which room
 *   useWorkspace()  -> { lastRun, setLastRun }          Lane B sets lastRun after a run; Lane C/D read it
 *   useEditor()     -> EditorHandle                     getValue / replaceAll / setMarkers / highlightLine
 *   usePresence()   -> PresenceUser[]                   who is in the room (Lane A feeds it from Yjs awareness in P-A3)
 *
 * Session lives in sessionStorage (per browser TAB) so two tabs on one laptop are two different people.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditorHandle, PresenceUser, Role, RunResult, SessionUser } from '@syncverse/shared';
import { ToastProvider } from './shell/toast';

// ---------------------------------------------------------------------------------------- session
const STORAGE_KEY = 'syncverse.session';
// No red: red means error in this UI.
// Every colour keeps white text at >= 4.5:1 (cursor labels, avatar initials).
const COLORS = ['#1f5fbf', '#26794f', '#6b4fbb', '#b8531b', '#0b7477', '#a0522d', '#7a3e9d', '#3d6b99'];

function colorFor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Read the current session without React (used by api.ts). */
export function readSession(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export interface JoinInput {
  name: string;
  role: Role;
  roomCode: string;
}

interface SessionCtx {
  session: SessionUser | null;
  join: (input: JoinInput) => void;
  leave: () => void;
}
const SessionContext = createContext<SessionCtx | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(() => readSession());
  const join = useCallback((input: JoinInput) => {
    const prev = readSession();
    const userId = prev?.userId ?? newId();
    const next: SessionUser = {
      userId,
      name: input.name.trim() || 'Guest',
      role: input.role,
      // Same charset the server accepts for /collab/<code>; anything else would make the WebSocket path invalid.
      roomCode: input.roomCode.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'demo',
      color: colorFor(userId),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);
  const leave = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);
  const value = useMemo(() => ({ session, join, leave }), [session, join, leave]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside AppProviders');
  return v;
}

/** For panels that only render after join. Throws if not joined, so you never have to null-check. */
export function useSessionUser(): SessionUser {
  const { session } = useSession();
  if (!session) throw new Error('not joined');
  return session;
}

// ------------------------------------------------------------------------------------- workspace
interface WorkspaceCtx {
  lastRun: RunResult | null;
  setLastRun: (r: RunResult | null) => void;
}
const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const value = useMemo(() => ({ lastRun, setLastRun }), [lastRun]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error('useWorkspace outside AppProviders');
  return v;
}

// ---------------------------------------------------------------------------------------- editor
/**
 * `useEditor()` returns ONE stable object whose methods delegate to whichever editor is currently registered.
 * Before the editor mounts, getValue() returns '' and the other calls do nothing, so other lanes never crash.
 * Only Lane A's EditorPanel calls `useEditorRegistry()` to register the real implementation.
 */
type Register = (impl: EditorHandle | null) => void;
const EditorContext = createContext<EditorHandle | null>(null);
const EditorRegistryContext = createContext<Register | null>(null);

function EditorProvider({ children }: { children: ReactNode }) {
  const implRef = useRef<EditorHandle | null>(null);
  const handle = useMemo<EditorHandle>(
    () => ({
      getValue: () => implRef.current?.getValue() ?? '',
      replaceAll: (t) => implRef.current?.replaceAll(t),
      setMarkers: (m) => implRef.current?.setMarkers(m),
      highlightLine: (l) => implRef.current?.highlightLine(l),
    }),
    [],
  );
  const register = useCallback<Register>((impl) => {
    implRef.current = impl;
  }, []);
  return (
    <EditorRegistryContext.Provider value={register}>
      <EditorContext.Provider value={handle}>{children}</EditorContext.Provider>
    </EditorRegistryContext.Provider>
  );
}

export function useEditor(): EditorHandle {
  const v = useContext(EditorContext);
  if (!v) throw new Error('useEditor outside AppProviders');
  return v;
}

/** Lane A only. */
export function useEditorRegistry(): Register {
  const v = useContext(EditorRegistryContext);
  if (!v) throw new Error('useEditorRegistry outside AppProviders');
  return v;
}

// -------------------------------------------------------------------------------------- presence
const PresenceContext = createContext<PresenceUser[]>([]);
const PresenceSetterContext = createContext<(users: PresenceUser[]) => void>(() => {});

function PresenceProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  return (
    <PresenceSetterContext.Provider value={setUsers}>
      <PresenceContext.Provider value={users}>{children}</PresenceContext.Provider>
    </PresenceSetterContext.Provider>
  );
}

/** Everyone currently in the room, including me. Empty until P-A3 feeds it from Yjs awareness. */
export function usePresence(): PresenceUser[] {
  return useContext(PresenceContext);
}

/** Lane A only (P-A3). */
export function usePresenceSetter(): (users: PresenceUser[]) => void {
  return useContext(PresenceSetterContext);
}

// ------------------------------------------------------------------------------------ all together
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <WorkspaceProvider>
        <EditorProvider>
          <PresenceProvider>
            <ToastProvider>{children}</ToastProvider>
          </PresenceProvider>
        </EditorProvider>
      </WorkspaceProvider>
    </SessionProvider>
  );
}



