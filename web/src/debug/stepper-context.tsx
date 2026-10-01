/**
 * The step-through debugger's state, shared by the console's Debug button and the Debug tool. Mounted by the studio shell, so a
 * trace started from the console is there when the Debug tool opens, and mentors hear about their students' traces whichever tool
 * is open.
 *
 * Own session: `start()` runs the open file under the tracer on the server (Python), keeps the trace, and lights the current step's
 * line in the shared editor like an IDE. The position is shared with the mentors who hold an ACTIVE debug grant, so they can follow
 * along live. Watching: a mentor with an active grant loads the student's latest trace, follows the student's position or steps on
 * their own. Server: routes/trace.ts; events `trace` and `trace-step` arrive on /api/debug/events.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DebugTrace } from '@syncverse/shared';
import { ApiError, api, errorMessage, eventSourceUrl } from '../api';
import { useActiveFile, useEditor, useSessionUser } from '../session';
import { useToast } from '../shell/toast';

export interface WatchState {
  ownerId: string;
  ownerName: string;
  trace: DebugTrace | null;
  /** the step the student is on right now */
  live: number;
  /** a newer trace arrived since this one was opened */
  fresh: boolean;
  loading: boolean;
  error: string | null;
}

interface Ctx {
  own: { trace: DebugTrace | null; at: number; busy: boolean; error: string | null };
  /** Debug the open file. Resolves when the trace is ready (or has failed: see own.error). */
  start: (opts?: { stdin?: string }) => Promise<void>;
  setOwnAt: (at: number) => void;
  /** Stop debugging: clears the line marker in the editor. */
  stop: () => void;
  watch: Record<string, WatchState>;
  loadWatch: (ownerId: string, ownerName: string) => Promise<void>;
  closeWatch: (ownerId: string) => void;
  /** The open file can be stepped through (it is Python). */
  canDebug: boolean;
}

const DebuggerContext = createContext<Ctx | null>(null);

export function useDebugger(): Ctx {
  const v = useContext(DebuggerContext);
  if (!v) throw new Error('useDebugger outside DebuggerProvider');
  return v;
}

const POSITION_MS = 150;

export function DebuggerProvider({ children, onShow }: { children: ReactNode; onShow: () => void }) {
  const me = useSessionUser();
  const editor = useEditor();
  const file = useActiveFile();
  const toast = useToast();
  const [trace, setTrace] = useState<DebugTrace | null>(null);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<Record<string, WatchState>>({});
  const traceRef = useRef<DebugTrace | null>(null);
  traceRef.current = trace;
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRef = useRef(onShow);
  showRef.current = onShow;
  const canDebug = !file || file.language === 'python';

  /** Light the line of step `n` in the shared editor, when the editor still holds the traced code. */
  const mark = useCallback(
    (t: DebugTrace | null, n: number) => {
      const line = t?.steps[n]?.l;
      editor.stepLine?.(t && line && editor.getValue() === t.source ? line : null);
    },
    [editor],
  );

  const setOwnAt = useCallback(
    (n: number) => {
      const t = traceRef.current;
      if (!t) return;
      const next = Math.max(0, Math.min(t.steps.length - 1, n));
      setAt(next);
      mark(t, next);
      if (positionTimer.current) clearTimeout(positionTimer.current);
      positionTimer.current = setTimeout(() => {
        void api.post('/api/debug/trace/position', { id: t.id, step: next }).catch(() => undefined); // only matters while a mentor watches
      }, POSITION_MS);
    },
    [mark],
  );

  const start = useCallback(
    async (opts?: { stdin?: string }) => {
      if (busy) return;
      let stdin = opts?.stdin;
      if (stdin === undefined) {
        try {
          stdin = sessionStorage.getItem(`sv.stdin.${me.roomCode}`) ?? '';
        } catch {
          stdin = '';
        }
      }
      setBusy(true);
      setError(null);
      showRef.current(); // open the Debug tool so the person sees the stepper arrive
      try {
        const t = await api.post<DebugTrace>('/api/debug/trace', { roomCode: me.roomCode, source: editor.getValue(), stdin, language: file?.language ?? 'python' });
        setTrace(t);
        setAt(0);
        mark(t, 0);
      } catch (e) {
        setError(errorMessage(e, 'Could not debug this program. Try again.'));
        if (!(e instanceof ApiError)) setTrace(null);
      } finally {
        setBusy(false);
      }
    },
    [busy, editor, file?.language, mark, me.roomCode],
  );

  const stop = useCallback(() => {
    setTrace(null);
    setAt(0);
    setError(null);
    editor.stepLine?.(null);
  }, [editor]);

  const loadWatch = useCallback(async (ownerId: string, ownerName: string) => {
    setWatch((prev) => ({ ...prev, [ownerId]: { ownerId, ownerName, trace: prev[ownerId]?.trace ?? null, live: prev[ownerId]?.live ?? 0, fresh: false, loading: true, error: null } }));
    try {
      const r = await api.get<{ trace: DebugTrace | null; position: number }>(`/api/debug/trace/latest?ownerId=${encodeURIComponent(ownerId)}`);
      setWatch((prev) => ({ ...prev, [ownerId]: { ownerId, ownerName, trace: r.trace, live: r.position, fresh: false, loading: false, error: null } }));
    } catch (e) {
      setWatch((prev) => ({ ...prev, [ownerId]: { ownerId, ownerName, trace: null, live: 0, fresh: false, loading: false, error: errorMessage(e, `Could not read ${ownerName}'s debug session.`) } }));
    }
  }, []);

  const closeWatch = useCallback((ownerId: string) => {
    setWatch((prev) => {
      const { [ownerId]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  // Events for mentors: a student started a trace, or moved to another step.
  useEffect(() => {
    const es = new EventSource(eventSourceUrl('/api/debug/events?room=' + encodeURIComponent(me.roomCode)));
    es.addEventListener('trace', (m) => {
      const d = JSON.parse((m as MessageEvent).data) as { ownerId: string; ownerName: string; steps: number; error: string | null };
      toast(`${d.ownerName} is stepping through their code (${d.steps} steps${d.error ? `, ends with ${d.error}` : ''}).`, 'info');
      const have = watchRef.current[d.ownerId];
      if (have) void loadWatch(d.ownerId, d.ownerName); // already looking at this person: show the new trace
    });
    es.addEventListener('trace-step', (m) => {
      const d = JSON.parse((m as MessageEvent).data) as { ownerId: string; id: string; step: number };
      setWatch((prev) => (prev[d.ownerId]?.trace?.id === d.id ? { ...prev, [d.ownerId]: { ...prev[d.ownerId], live: d.step } } : prev));
    });
    return () => es.close();
  }, [me.roomCode, loadWatch, toast]);

  useEffect(() => () => {
    if (positionTimer.current) clearTimeout(positionTimer.current);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ own: { trace, at, busy, error }, start, setOwnAt, stop, watch, loadWatch, closeWatch, canDebug }),
    [trace, at, busy, error, start, setOwnAt, stop, watch, loadWatch, closeWatch, canDebug],
  );
  return <DebuggerContext.Provider value={value}>{children}</DebuggerContext.Provider>;
}
