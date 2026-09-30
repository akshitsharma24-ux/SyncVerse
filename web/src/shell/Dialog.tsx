/**
 * Accessible modal dialog and side drawer. Owner: Lane A (shell). Any lane may use it.
 *   <Dialog title="Delete file?" onClose={close}>...</Dialog>
 *   <Dialog title="Room" variant="drawer" onClose={close}>...</Dialog>
 * Focus moves into the dialog, Tab stays inside, Escape and a click on the dim background close it, and focus returns to
 * the button that opened it.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  title,
  onClose,
  children,
  variant = 'modal',
  width,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: 'modal' | 'drawer';
  width?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Autofocus an input if the dialog has one (sign-in form), else the close button.
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      (variant === 'drawer' ? null : el?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')) ??
      el?.querySelector<HTMLElement>('.dlg-close');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={`dlg-overlay ${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dlg ${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={width ? { width } : undefined} data-testid={testId}>
        <div className="dlg-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn btn-outline btn-sm dlg-close" style={{ width: 30, padding: 0 }} onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="dlg-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
