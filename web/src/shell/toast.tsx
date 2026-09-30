/**
 * Toasts: short, self-dismissing messages at the bottom left. Owner: Lane A (shell).
 * Any lane can use them:   const toast = useToast();   toast('Patch applied', 'ok');
 * Kinds: 'info' (default), 'ok', 'error'. Announced to screen readers (aria-live).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'info' | 'ok' | 'error';
interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}
type Push = (text: string, kind?: ToastKind) => void;

const ToastContext = createContext<Push>(() => {});
const MAX = 3;
const LIFETIME_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const push = useCallback<Push>((text, kind = 'info') => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-(MAX - 1)), { id, text, kind }]);
    timers.current.push(window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), LIFETIME_MS));
  }, []);

  const value = useMemo(() => push, [push]);
  const color = { info: 'var(--ink)', ok: 'var(--ok)', error: 'var(--danger)' } as const;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{ position: 'fixed', left: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50, pointerEvents: 'none' }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            data-kind={t.kind}
            style={{
              pointerEvents: 'auto',
              background: 'var(--panel)',
              color: 'var(--ink)',
              border: '1px solid var(--ink)',
              borderLeft: `4px solid ${color[t.kind]}`,
              borderRadius: 3,
              padding: '8px 14px',
              fontSize: 13,
              boxShadow: '4px 4px 0 -1px var(--paper), 4px 4px 0 0 var(--ink)',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  return useContext(ToastContext);
}
