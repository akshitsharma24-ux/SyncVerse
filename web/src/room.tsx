/**
 * The room I am in: membership, my verified role, who else is a member, and the live rules (paused editing, frozen room).
 * Owner: Lane A.
 *
 *   const { status, room, me, isModerator, canEdit, readOnlyReason } = useRoom();
 *
 * RoomProvider (mounted by App.tsx once someone has joined) registers me with the server (POST /api/rooms/:code/join), which
 * answers with the role I really hold, then listens to a server-sent event stream so a mentor's change (promote, pause, remove,
 * freeze) reaches me within a moment. Other lanes can read useRoom(); only the editor and the shell act on it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MemberView, Role, RoomView } from '@syncverse/shared';
import { api, errorMessage, eventSourceUrl } from './api';
import { useSession } from './session';
import { useToast } from './shell/toast';

export type RoomStatus = 'joining' | 'ready' | 'error' | 'removed' | 'deleted';

interface RoomCtx {
  status: RoomStatus;
  error: string | null;
  room: RoomView | null;
  me: MemberView | null;
  isOwner: boolean;
  /** owner or a mentor: may pause people, remove people, freeze the room */
  isModerator: boolean;
  canEdit: boolean;
  /** why editing is off, in words for the person affected; null when they can edit */
  readOnlyReason: string | null;
  retry: () => void;
  /** Each action resolves to an error message, or null when it worked. */
  setMember: (userId: string, patch: { role?: Role; muted?: boolean; removed?: boolean }) => Promise<string | null>;
  setSettings: (patch: { name?: string; lockMentorSeats?: boolean; frozen?: boolean }) => Promise<string | null>;
  deleteRoom: () => Promise<string | null>;
  muteAudio: (userId?: string) => Promise<{ error: string | null; muted: number }>;
}

const Ctx = createContext<RoomCtx | null>(null);

export function useRoom(): RoomCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRoom outside RoomProvider');
  return v;
}

/** Mirrors the server's rule (server/roomstore.ts canWrite) so the editor can show the reason before any edit is refused. */
export function editRule(room: RoomView | null, me: MemberView | null): { canEdit: boolean; reason: string | null } {
  if (!room || !me) return { canEdit: false, reason: null };
  if (me.role === 'viewer') return { canEdit: false, reason: 'You are a viewer: you can watch but not edit.' };
  if (me.muted) return { canEdit: false, reason: 'A mentor paused your editing. Ask them to turn it back on.' };
  if (room.frozen && me.role === 'student' && !me.owner) return { canEdit: false, reason: 'A mentor froze editing for everyone. Eyes on them for a moment.' };
  return { canEdit: true, reason: null };
}

const RETRY_MS = [700, 1500, 3000];

export function RoomProvider({ children }: { children: ReactNode }) {
  const { session, update } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState<RoomStatus>('joining');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const prev = useRef<{ room: RoomView | null; me: MemberView | null }>({ room: null, me: null });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const userId = session?.userId;
  const code = session?.roomCode;
  const me = useMemo(() => room?.members.find((m) => m.userId === userId) ?? null, [room, userId]);

  // Tell the person what changed (once per change), and keep the session's role equal to the room's record.
  const apply = useCallback(
    (next: RoomView) => {
      const uid = sessionRef.current?.userId;
      const before = prev.current;
      const mine = next.members.find((m) => m.userId === uid) ?? null;
      if (mine && before.me) {
        if (mine.role !== before.me.role) toast(`You are now ${mine.role === 'viewer' ? 'a viewer' : mine.role === 'mentor' ? 'a mentor' : 'a student'}.`, 'info');
        if (mine.muted !== before.me.muted) toast(mine.muted ? 'A mentor paused your editing.' : 'You can edit again.', mine.muted ? 'info' : 'ok');
      }
      if (before.room && next.frozen !== before.room.frozen && mine && !mine.owner && mine.role === 'student') {
        toast(next.frozen ? 'A mentor froze editing for everyone.' : 'Editing is back on.', next.frozen ? 'info' : 'ok');
      }
      if (before.room && next.name !== before.room.name) toast(`Room renamed to ${next.name}.`, 'info');
      if (mine && sessionRef.current && mine.role !== sessionRef.current.role) update({ role: mine.role });
      prev.current = { room: next, me: mine };
      setRoom(next);
      if (mine?.removed) setStatus('removed');
    },
    [toast, update],
  );

  // Join, then follow the live stream. Re-runs when `attempt` changes (the Retry button).
  useEffect(() => {
    if (!code || !userId) return;
    let cancelled = false;
    let es: EventSource | null = null;
    setStatus('joining');
    setError(null);
    prev.current = { room: null, me: null };

    (async () => {
      let lastError = 'Could not join the room.';
      for (let i = 0; i <= RETRY_MS.length; i++) {
        if (cancelled) return;
        try {
          const r = await api.post<{ room: RoomView; me: MemberView; downgraded?: { reason: string } }>(`/api/rooms/${encodeURIComponent(code)}/join`, { role: sessionRef.current?.role ?? 'student' });
          if (cancelled) return;
          if (r.downgraded) toast(r.downgraded.reason, 'info');
          apply(r.room);
          setStatus((s) => (s === 'removed' ? s : 'ready'));
          es = new EventSource(eventSourceUrl(`/api/rooms/${encodeURIComponent(code)}/stream`));
          es.onmessage = (m) => {
            try {
              const ev = JSON.parse(m.data) as { type: string; room?: RoomView };
              if (ev.type === 'state' && ev.room) apply(ev.room);
              else if (ev.type === 'removed') setStatus('removed');
              else if (ev.type === 'deleted') {
                setStatus('deleted');
                es?.close();
              }
            } catch {
              /* ignore a malformed frame */
            }
          };
          return;
        } catch (e) {
          lastError = errorMessage(e, 'Could not join the room.');
          const status = (e as { status?: number }).status;
          if (status === 403 && (e as { body?: { error?: string } }).body?.error === 'removed') {
            setError(lastError);
            setStatus('removed');
            return;
          }
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) break; // not worth retrying
          if (i < RETRY_MS.length) await new Promise((r) => setTimeout(r, RETRY_MS[i]));
        }
      }
      if (!cancelled) {
        setError(lastError);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, userId, attempt]);

  const act = useCallback(async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }, []);

  const value = useMemo<RoomCtx>(() => {
    const rule = editRule(room, me);
    const base = `/api/rooms/${encodeURIComponent(code ?? '')}`;
    return {
      status,
      error,
      room,
      me,
      isOwner: Boolean(me?.owner),
      isModerator: Boolean(me && !me.removed && (me.owner || me.role === 'mentor')),
      canEdit: rule.canEdit,
      readOnlyReason: rule.reason,
      retry: () => setAttempt((n) => n + 1),
      setMember: (id, patch) => act(() => api.post(`${base}/members/${encodeURIComponent(id)}`, patch)),
      setSettings: (patch) => act(() => api.post(`${base}/settings`, patch)),
      deleteRoom: () => act(() => api.post(`${base}/delete`)),
      muteAudio: async (id) => {
        try {
          const r = await api.post<{ muted: number }>(id ? `${base}/members/${encodeURIComponent(id)}/mute-audio` : `${base}/mute-all-audio`);
          return { error: null, muted: r.muted };
        } catch (e) {
          return { error: errorMessage(e), muted: 0 };
        }
      },
    };
  }, [status, error, room, me, code, act]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
