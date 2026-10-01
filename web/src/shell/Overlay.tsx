/**
 * A full-window layer on <body> (the learning panel is layout-contained, so a fixed overlay inside it would be trapped). Esc closes.
 * Used by the quiz arena and the step-through debugger. Styles: web/src/quiz/quiz.css (.qz-overlay).
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

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
