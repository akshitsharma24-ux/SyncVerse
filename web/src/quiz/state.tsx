/**
 * The room's quiz, live. QuizProvider (mounted by the studio shell, so it works whichever tool is open) keeps the latest snapshot
 * from the server's event stream, falls back to polling if the stream drops, and tells people when a quiz is created, started or
 * finished. It also owns the two full-window views (the answering arena and the leaderboard board) so any button can open them.
 *
 *   const { snap, view, canManage, canAnswer, act, open } = useQuiz();   // from ./context
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { QuizSnapshot, QuizView } from '@syncverse/shared';
import { api, errorMessage, eventSourceUrl } from '../api';
import { useSessionUser } from '../session';
import { useToast } from '../shell/toast';
import { Arena } from './Arena';
import { BoardView } from './BoardView';
import { QuizContext, type Ctx, type Surface } from './context';
import './quiz.css';

const POLL_MS = 5000;

export function QuizProvider({ children }: { children: ReactNode }) {
  const me = useSessionUser();
  const toast = useToast();
  const [snap, setSnap] = useState<QuizSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [surface, setSurface] = useState<Surface>(null);
  const skew = useRef(0);
  const prev = useRef<QuizView | null | undefined>(undefined);
  const manageRef = useRef(false);

  const apply = useCallback(
    (next: QuizSnapshot) => {
      const a = next.active;
      if (a) skew.current = a.serverNow - Date.now();
      const before = prev.current;
      manageRef.current = next.canManage;
      // Tell people what happened, once. The first snapshot after joining is only a baseline.
      if (before !== undefined && !next.canManage) {
        if (a && (!before || before.id !== a.id) && a.status === 'lobby') toast(`A quiz is coming up: ${a.title}. Your teacher will start it here.`, 'info');
        else if (a && before && before.id === a.id && before.status === 'lobby' && a.status === 'running') toast(`Quiz started: ${a.title}. ${a.config.minutes} minutes.`, 'ok');
        else if (a && before && before.id === a.id && before.status === 'running' && a.status === 'ended') toast('The quiz is over. See the final leaderboard.', 'info');
      }
      prev.current = a;
      setSnap(next);
      setLoading(false);
    },
    [toast],
  );

  // Follow the stream; if it fails, poll. Either way the screen is never more than a few seconds behind.
  useEffect(() => {
    let stop = false;
    let es: EventSource | null = null;
    const load = () =>
      api
        .get<QuizSnapshot>('/api/quiz')
        .then((s) => !stop && apply(s))
        .catch(() => !stop && setLoading(false));
    void load();
    try {
      es = new EventSource(eventSourceUrl('/api/quiz/stream'));
      es.onmessage = (m) => {
        try {
          apply(JSON.parse(m.data) as QuizSnapshot);
        } catch {
          /* ignore a malformed frame */
        }
      };
    } catch {
      /* no EventSource: polling covers it */
    }
    const poll = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(poll);
      es?.close();
    };
  }, [apply, me.roomCode, me.userId]);

  const reload = useCallback(async () => {
    try {
      apply(await api.get<QuizSnapshot>('/api/quiz'));
    } catch {
      /* keep what is on screen */
    }
  }, [apply]);

  const act = useCallback<Ctx['act']>(
    async (route, body) => {
      try {
        const r = await api.post<QuizSnapshot | Record<string, unknown> | null>(`/api/quiz/${route}`, body);
        if (r && typeof r === 'object' && 'active' in r && 'past' in r) apply(r as QuizSnapshot);
        return null;
      } catch (e) {
        return errorMessage(e, 'That did not work. Try again.');
      }
    },
    [apply],
  );

  const view = snap?.active ?? null;
  const value = useMemo<Ctx>(
    () => ({ snap, view, loading, canManage: snap?.canManage ?? false, canAnswer: snap?.canAnswer ?? false, skew: skew.current, act, open: setSurface, reload }),
    [snap, view, loading, act, reload],
  );

  const shown = surface && (surface.quizId === view?.id ? view : snap?.past.find((p) => p.id === surface.quizId));
  return (
    <QuizContext.Provider value={value}>
      {children}
      {surface?.kind === 'arena' && shown && <Arena view={shown} onClose={() => setSurface(null)} />}
      {surface?.kind === 'board' && shown && <BoardView view={shown} onClose={() => setSurface(null)} />}
    </QuizContext.Provider>
  );
}
