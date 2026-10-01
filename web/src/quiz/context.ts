/** The shared quiz context: what every quiz view reads. The provider that fills it lives in state.tsx (kept apart so views can import this without a cycle). */
import { createContext, useContext, useEffect, useState } from 'react';
import type { QuizSnapshot, QuizView } from '@syncverse/shared';

export type Surface = { kind: 'arena'; quizId: string } | { kind: 'board'; quizId: string } | null;

export interface Ctx {
  snap: QuizSnapshot | null;
  /** the room's current quiz, if any */
  view: QuizView | null;
  loading: boolean;
  canManage: boolean;
  canAnswer: boolean;
  /** corrects the local clock to the server's: now + skew is the server time */
  skew: number;
  /** POST to a quiz route; resolves to an error message, or null when it worked */
  act: (route: string, body?: unknown) => Promise<string | null>;
  open: (surface: Surface) => void;
  reload: () => Promise<void>;
}

export const QuizContext = createContext<Ctx | null>(null);

export function useQuiz(): Ctx {
  const v = useContext(QuizContext);
  if (!v) throw new Error('useQuiz outside QuizProvider');
  return v;
}

/** A clock that ticks: re-renders every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}


/** Milliseconds left in a running quiz, by the server's clock (0 once over). */
export function msLeft(view: QuizView, now: number, skew: number): number {
  if (view.status !== 'running' || !view.endsAt) return 0;
  return Math.max(0, view.endsAt - (now + skew));
}
