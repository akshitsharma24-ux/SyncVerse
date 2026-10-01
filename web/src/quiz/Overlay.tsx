import { formatClock, type QuizView } from '@syncverse/shared';
import { msLeft, useNow, useQuiz } from './context';

export { Overlay } from '../shell/Overlay';

/** The time left in a running quiz (or how long it lasted / "Time's up"), ticking every second, by the server's clock. */
export function Countdown({ view, big = false }: { view: QuizView; big?: boolean }) {
  const { skew } = useQuiz();
  const now = useNow(250);
  const left = msLeft(view, now, skew);
  if (view.status === 'lobby') return <span className="qz-clock mono" data-testid="quiz-clock">{view.config.minutes}:00</span>;
  if (view.status === 'ended') return <span className="qz-clock mono ended" data-testid="quiz-clock">Ended</span>;
  const urgent = left <= 60_000;
  return (
    <span className={`qz-clock mono ${big ? 'big' : ''} ${urgent ? 'urgent' : ''}`} data-testid="quiz-clock" role="timer" aria-label={`${formatClock(left)} left`}>
      {left > 0 ? formatClock(left) : "Time's up"}
    </span>
  );
}
