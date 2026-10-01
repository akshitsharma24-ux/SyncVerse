/**
 * Shared React contexts and hooks. Owner: Lane A. After P-A1 other lanes only IMPORT from here.
 *
 *   useSession()    -> { session, join, leave }         who am I, which room
 *   useWorkspace()  -> { lastRun, setLastRun }          Lane B sets lastRun after a run; Lane C/D read it
 *   useEditor()     -> EditorHandle                     getValue / replaceAll / setMarkers / highlightLine
 *   usePresence()   -> PresenceUser[]                   who is in the room (Lane A feeds it from Yjs awareness in P-A3)
 *   useActiveFile() -> { id, name, language } | null    the file being edited; Lane B passes .language to the runner
 *
 * Session lives in sessionStorage (per browser TAB) so two tabs on one laptop are two different people.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { PEOPLE_COLORS, type EditorHandle, type PresenceUser, type Role, type RunResult, type SessionUser } from '@syncverse/shared';
import { getAccount, isAccountId } from './auth';
import { ToastProvider } from './shell/toast';

// ---------------------------------------------------------------------------------------- session
const STORAGE_KEY = 'syncverse.session';
// No red: red means error in this UI. Every colour keeps white text at >= 4.5:1 (see PEOPLE_COLORS in shared/types.ts).
const COLORS = PEOPLE_COLORS;

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
  /** Change fields of the current session (the room can change my role while I am in it). */
  update: (patch: Partial<Pick<SessionUser, 'role' | 'name'>>) => void;
}
const SessionContext = createContext<SessionCtx | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(() => readSession());
  const join = useCallback((input: JoinInput) => {
    const prev = readSession();
    // A signed-in account IS its identity (same person on every device); a guest gets one id per browser tab.
    const account = getAccount();
    const userId = account ? account.id : prev && !isAccountId(prev.userId) ? prev.userId : newId();
    const next: SessionUser = {
      userId,
      name: (account ? account.displayName : input.name.trim()) || 'Guest',
      role: input.role,
      // Same charset the server accepts for /collab/<code>; anything else would make the WebSocket path invalid.
      roomCode: input.roomCode.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'demo',
      color: account ? account.color : colorFor(userId),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);
  const leave = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);
  const update = useCallback<SessionCtx['update']>((patch) => {
    const cur = readSession();
    if (!cur) return;
    const next = { ...cur, ...patch };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);
  const value = useMemo(() => ({ session, join, leave, update }), [session, join, leave, update]);
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
      setLanguage: (l) => implRef.current?.setLanguage?.(l),
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

// ---------------------------------------------------------------------------------------- active file
export interface ActiveFile {
  id: string;
  name: string;
  /** a LanguageId from shared/files.ts: 'python' | 'javascript' | 'java' | 'c' | 'cpp' | ... */
  language: string;
}
const ActiveFileContext = createContext<ActiveFile | null>(null);
const ActiveFileSetterContext = createContext<(f: ActiveFile | null) => void>(() => {});

function ActiveFileProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<ActiveFile | null>(null);
  const set = useCallback((f: ActiveFile | null) => {
    setFile((cur) => (cur && f && cur.id === f.id && cur.name === f.name && cur.language === f.language ? cur : f));
  }, []);
  return (
    <ActiveFileSetterContext.Provider value={set}>
      <ActiveFileContext.Provider value={file}>{children}</ActiveFileContext.Provider>
    </ActiveFileSetterContext.Provider>
  );
}

/** The file currently open in the editor (null before the editor has loaded). Lane B: send `.language` with the run request. */
export function useActiveFile(): ActiveFile | null {
  return useContext(ActiveFileContext);
}

/** Lane A only. */
export function useActiveFileSetter(): (f: ActiveFile | null) => void {
  return useContext(ActiveFileSetterContext);
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
            <ActiveFileProvider>
              <ToastProvider>{children}</ToastProvider>
            </ActiveFileProvider>
          </PresenceProvider>
        </EditorProvider>
      </WorkspaceProvider>
    </SessionProvider>
  );
}
