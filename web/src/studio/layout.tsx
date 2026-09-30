import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'studio.layout.v2';
const defaults = { sidebar: false, console: true, learning: true, sidebarWidth: 195, consoleHeight: 190, learningWidth: 320, learningHeight: 440 };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function useStudioLayout() {
  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof saved[key] === typeof value && (typeof value !== 'number' || Number.isFinite(saved[key])) ? saved[key] : value])) as typeof defaults;
    } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* Storage is optional. */ } }, [layout]);
  return [layout, (patch: Partial<typeof defaults>) => setLayout(previous => ({ ...previous, ...patch }))] as const;
}

export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(previous => Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1 ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

export function ResizeHandle({ axis, label, controls, value, min, max, direction = 1, onChange, onDrag }: {
  axis: 'x' | 'y'; label: string; controls: string; value: number; min: number; max: number;
  direction?: 1 | -1; onChange: (value: number) => void; onDrag: (axis: 'x' | 'y' | null) => void;
}) {
  const start = useRef<{ position: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  function finish() { start.current = null; setDragging(false); onDrag(null); }
  return <div
    className={`studio-resize resize-${axis}${dragging ? ' dragging' : ''}`}
    role="separator" aria-label={label} aria-controls={controls}
    aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={Math.round(max)}
    tabIndex={0} title={`${label} — drag, or use arrow keys`}
    onKeyDown={event => {
      const decrease = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
      const increase = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      let next = value;
      if (event.key === decrease || event.key === increase) next += (event.key === increase ? 1 : -1) * direction * (event.shiftKey ? 50 : 20);
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      else return;
      event.preventDefault(); onChange(clamp(next, min, max));
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      start.current = { position: axis === 'x' ? event.clientX : event.clientY, value };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true); onDrag(axis);
    }}
    onPointerMove={event => {
      if (!start.current) return;
      const position = axis === 'x' ? event.clientX : event.clientY;
      onChange(clamp(start.current.value + (position - start.current.position) * direction, min, max));
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
  ><span/></div>;
}
