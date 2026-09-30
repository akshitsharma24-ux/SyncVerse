/**
 * Workspace shell. Owner: Lane A. After P-A1 the SLOTS below (imports of each lane's folder) do not change:
 * each lane replaces the contents of its own folder's index.tsx. The look (theme, resizable panels, tabs) lives here.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AppProviders, useSession } from './session';
import JoinGate from './JoinGate';
import { EditorPanel } from './editor';
import { VideoDock } from './video';
import { RunPanel } from './console';
import { QualityPanel } from './quality';
import { AIPanel } from './ai';
import { DebugPanel } from './debug';
import { ProgressPanel } from './progress';
import { TopBar } from './shell/TopBar';
import { Icon } from './shell/icons';

const TABS = [
  { id: 'video', label: 'Video', icon: 'video', el: <VideoDock /> },
  { id: 'ai', label: 'AI', icon: 'sparkle', el: <AIPanel /> },
  { id: 'quality', label: 'Quality', icon: 'checklist', el: <QualityPanel /> },
  { id: 'debug', label: 'Debug', icon: 'bug', el: <DebugPanel /> },
  { id: 'progress', label: 'Progress', icon: 'chart', el: <ProgressPanel /> },
] as const;
type TabId = (typeof TABS)[number]['id'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A size that survives reloads (per browser, not per room). */
function useSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(size));
    } catch {
      /* ignore */
    }
  }, [key, size]);
  return [size, (n: number) => setSize(clamp(n, min, max))] as const;
}

function Splitter({ axis, onDrag, label }: { axis: 'v' | 'h'; onDrag: (delta: number) => void; label: string }) {
  const [active, setActive] = useState(false);
  const last = useRef(0);
  const pos = (e: { clientX: number; clientY: number }) => (axis === 'v' ? e.clientX : e.clientY);
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (axis === 'v' && e.key === 'ArrowLeft') onDrag(-step);
    else if (axis === 'v' && e.key === 'ArrowRight') onDrag(step);
    else if (axis === 'h' && e.key === 'ArrowUp') onDrag(-step);
    else if (axis === 'h' && e.key === 'ArrowDown') onDrag(step);
  };
  return (
    <div
      className={`splitter ${axis}`}
      data-active={active}
      role="separator"
      aria-label={label}
      aria-orientation={axis === 'v' ? 'vertical' : 'horizontal'}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = pos(e);
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!active) return;
        const p = pos(e);
        onDrag(p - last.current);
        last.current = p;
      }}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
    />
  );
}

function Shell() {
  const { session } = useSession();
  const [tab, setTab] = useState<TabId>('ai');
  const [dockW, setDockW] = useSize('sv.dockW', 420, 300, 760);
  const [consoleH, setConsoleH] = useSize('sv.consoleH', 250, 120, 560);
  if (!session) return null;

  return (
    <div className="ws">
      <TopBar />
      <div className="hatch thin" />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: 10 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <section className="panel" style={{ flex: 1 }} aria-label="Shared editor">
            <EditorPanel />
          </section>
          <Splitter axis="h" label="Resize console" onDrag={(d) => setConsoleH(consoleH - d)} />
          <section className="panel" style={{ height: consoleH, flex: 'none' }} aria-label="Console">
            <div className="panel-head">
              <span className="eyebrow" style={{ color: 'var(--ink)' }}>Console</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="lock" size={12} /> only you can see your runs
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10 }}>
              <RunPanel />
            </div>
          </section>
        </div>

        <Splitter axis="v" label="Resize side panel" onDrag={(d) => setDockW(dockW - d)} />

        <aside className="panel" style={{ width: dockW, flex: 'none' }} aria-label="Tools">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
          {/* Every tab stays mounted (hidden) so video and other state survive switching tabs. */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {TABS.map((t) => (
              <div key={t.id} role="tabpanel" className={tab === t.id ? 'h-full' : 'hidden'}>
                {t.el}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Gate() {
  const { session } = useSession();
  return session ? <Shell /> : <JoinGate />;
}

export default function App() {
  return (
    <AppProviders>
      <Gate />
    </AppProviders>
  );
}
