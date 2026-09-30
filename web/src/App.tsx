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
import { PanelBoundary } from './shell/PanelBoundary';
import { PresenceToasts } from './shell/PresenceToasts';

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

function Splitter({ axis, onDrag, label, value, min, max }: { axis: 'v' | 'h'; onDrag: (delta: number) => void; label: string; value: number; min: number; max: number }) {
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
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
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

  // Arrow keys / Home / End move between tabs (roving focus), as the ARIA tabs pattern expects.
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next].id;
    setTab(id);
    requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
  };

  if (!session) return null;

  return (
    <div className="ws">
      <a href="#editor-region" className="skip-link">
        Skip to the editor
      </a>
      <TopBar />
      <PresenceToasts />
      <div className="hatch thin" />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: 10 }}>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <section className="panel" style={{ flex: 1 }} aria-label="Shared editor" id="editor-region" tabIndex={-1}>
            <PanelBoundary name="editor">
              <EditorPanel />
            </PanelBoundary>
          </section>
          <Splitter axis="h" label="Resize console" value={consoleH} min={120} max={560} onDrag={(d) => setConsoleH(consoleH - d)} />
          <section className="panel" style={{ height: consoleH, flex: 'none' }} aria-label="Console">
            <div className="panel-head">
              <span className="eyebrow" style={{ color: 'var(--ink)' }}>
                Console
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="lock" size={12} /> only you can see your runs
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10 }}>
              <PanelBoundary name="console">
                <RunPanel />
              </PanelBoundary>
            </div>
          </section>
        </main>

        <Splitter axis="v" label="Resize side panel" value={dockW} min={300} max={760} onDrag={(d) => setDockW(dockW - d)} />

        <aside className="panel" style={{ width: dockW, flex: 'none' }} aria-label="Tools">
          <div className="tabs" role="tablist" aria-label="Tools" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className="tab"
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
          {/* Every tab stays mounted (hidden) so video and other state survive switching tabs. */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {TABS.map((t) => (
              <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} className={tab === t.id ? 'h-full' : 'hidden'}>
                <PanelBoundary name={t.id}>{t.el}</PanelBoundary>
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
