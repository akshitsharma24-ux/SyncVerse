/**
 * Lane D (Miti): P-D3 planted-bug sample menu. Loads a program into the shared editor via replaceAll,
 * so every collaborator gets it. Sample sources live in docs/samples/*.py. "Load demo history" seeds progress data.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useEditor, useSessionUser } from '../session';

const files = import.meta.glob('../../../docs/samples/*.py', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const SAMPLES = Object.entries(files)
  .map(([path, source]) => {
    const file = path.split('/').pop()!;
    return { file, label: file.replace(/^\d+_/, '').replace(/\.py$/, '').replace(/_/g, ' '), source };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

export function SamplesMenu() {
  const editor = useEditor();
  const me = useSessionUser();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function reset() {
    if (!window.confirm('Reset the demo? This clears progress history, debug access and help flags for this room.')) return;
    try {
      await api.post('/api/demo/reset', { roomCode: me.roomCode });
      setNote('Demo reset');
    } catch {
      setNote('Could not reset');
    }
    setOpen(false);
    setTimeout(() => setNote(''), 2500);
  }

  async function seed() {
    try {
      await api.post('/api/demo/seed', { roomCode: me.roomCode });
      setNote('Demo history loaded');
    } catch {
      setNote('Could not load history');
    }
    setOpen(false);
    setTimeout(() => setNote(''), 2500);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" data-testid="samples-btn">
        {note || 'Samples'}
      </button>
      {open && (
        <div role="menu" data-testid="samples-menu" className="frame"
          style={{ position: 'absolute', right: 0, top: '110%', zIndex: 40, background: 'var(--panel)', border: '1px solid var(--ink)', borderRadius: 4, minWidth: 220, padding: 4 }}>
          {SAMPLES.map((s) => (
            <button key={s.file} role="menuitem" className="btn btn-outline btn-sm btn-block" style={{ justifyContent: 'flex-start', border: 0, textTransform: 'capitalize' }}
              onClick={() => {
                editor.replaceAll(s.source);
                setOpen(false);
              }}>
              {s.label}
            </button>
          ))}
          <hr style={{ border: 0, borderTop: '1px solid var(--rule-soft)', margin: '4px 0' }} />
          <button role="menuitem" className="btn btn-outline btn-sm btn-block" style={{ justifyContent: 'flex-start', border: 0 }} onClick={seed}>
            Load demo history
          </button>
          <button role="menuitem" className="btn btn-outline btn-sm btn-block" style={{ justifyContent: 'flex-start', border: 0 }} onClick={reset} data-testid="reset-demo">
            Reset demo
          </button>
        </div>
      )}
    </div>
  );
}

export default SamplesMenu;
