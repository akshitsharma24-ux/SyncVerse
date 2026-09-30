/**
 * Top-bar chip that answers "why does feature X do nothing?": is the API reachable, and are the code runner (Judge0),
 * the AI (LLM) and video (LiveKit) configured on the server? Polls /api/health every few seconds. Owner: Lane A.
 *   data-state: 'ok' (everything configured) | 'setup' (API up, something not configured) | 'offline' (API unreachable)
 */
import { useEffect, useRef, useState } from 'react';
import { useLowBandwidth } from '../lowbandwidth';

interface Health {
  ok: boolean;
  configured: { judge0: boolean; llm: boolean; livekit: boolean };
  collab?: { rooms: number; connections: number };
}
type State = 'checking' | 'ok' | 'setup' | 'offline';

const POLL_MS = 4000;
const POLL_LOW_MS = 20000; // low-bandwidth mode checks less often
const ROWS: Array<{ key: keyof Health['configured']; label: string; what: string }> = [
  { key: 'judge0', label: 'Code runner', what: 'Run button (Judge0)' },
  { key: 'llm', label: 'AI tutor', what: 'Explain and patch (LLM)' },
  { key: 'livekit', label: 'Video', what: 'Video, audio, chat (LiveKit)' },
];

export function StatusChip() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<State>('checking');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const low = useLowBandwidth();

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      try {
        const res = await fetch('/api/health', { signal: ctl.signal });
        const h = (await res.json()) as Health;
        if (!alive) return;
        setHealth(h);
        setState(Object.values(h.configured).every(Boolean) ? 'ok' : 'setup');
      } catch {
        if (alive) setState('offline');
      } finally {
        clearTimeout(t);
      }
    };
    void check();
    const id = setInterval(check, low ? POLL_LOW_MS : POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [low]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const missing = health ? ROWS.filter((r) => !health.configured[r.key]).length : 0;
  const dot = state === 'ok' ? 'var(--ok)' : state === 'offline' ? 'var(--danger)' : state === 'setup' ? 'var(--warn)' : 'var(--soft)';
  const label = state === 'ok' ? 'All services ready' : state === 'offline' ? 'Server offline' : state === 'setup' ? `${missing} to set up` : 'Checking...';

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        data-testid="status-chip"
        data-state={state}
        style={{ gap: 7 }}
      >
        <i style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Service status"
          data-testid="status-popover"
          style={{ position: 'absolute', right: 0, top: 36, width: 290, zIndex: 40, background: 'var(--panel)', border: '1px solid var(--ink)', borderRadius: 4, padding: 12, boxShadow: '5px 5px 0 -1px var(--paper), 5px 5px 0 0 var(--ink)' }}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>service status</div>
          <Row label="Server" what="API and live editing" ok={state !== 'offline'} note={state === 'offline' ? 'Not reachable. Is npm run dev running?' : health?.collab ? `${health.collab.connections} connected, ${health.collab.rooms} room(s)` : ''} />
          {ROWS.map((r) => (
            <Row key={r.key} label={r.label} what={r.what} ok={!!health?.configured[r.key]} note={health && !health.configured[r.key] ? 'Not configured: add the key to .env and restart the server' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, what, ok, note }: { label: string; what: string; ok: boolean; note: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 8, padding: '6px 0', borderTop: '1px solid var(--rule-soft)' }} data-status-row={label} data-ok={ok}>
      <i style={{ width: 8, height: 8, marginTop: 5, borderRadius: '50%', background: ok ? 'var(--ok)' : 'var(--warn)', display: 'block' }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 550 }}>
          {label} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{ok ? 'ready' : 'needs attention'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{what}</div>
        {note && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}
