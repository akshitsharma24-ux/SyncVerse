/** A full-window layer on <body> (the learning panel is layout-contained, so a fixed overlay inside it would be trapped). Esc closes. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatClock, type QuizView } from '@syncverse/shared';
import { Icon } from '../shell/icons';
import { msLeft, useNow, useQuiz } from './context';

export function Overlay({ title, kicker, onClose, children, actions, testId }: { title: string; kicker?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="qz-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1} data-testid={testId}>
      <header className="qz-overlay-head">
        <div className="qz-overlay-title">
          {kicker && <span className="qz-kicker">{kicker}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="qz-overlay-actions">
          {actions}
          <button className="btn btn-outline btn-sm" onClick={onClose} aria-label="Close" data-testid="quiz-overlay-close"><Icon name="x" size={14} /><span>Close</span></button>
        </div>
      </header>
      <div className="qz-overlay-body">{children}</div>
    </div>,
    document.body,
  );
}

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
