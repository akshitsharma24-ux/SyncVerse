/**
 * Lane D (Miti): P-D3 planted-bug sample menu. Loads a program into the shared editor via replaceAll,
 * so every collaborator gets it. The programs live in docs/samples (see ./programs.ts): each demo exists in every runnable
 * language, and the menu loads the one for the open file's language. "Load demo history" seeds progress data.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useActiveFile, useEditor, useSessionUser } from '../session';
import { DEMO_PROGRAMS, demoLanguageFor, type DemoProgram } from './programs';

export function SamplesMenu() {
  const editor = useEditor();
  const me = useSessionUser();
  const file = useActiveFile();
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

  /** Load a demo in the open file's language (Python when the demo has none for it) and make the file match. */
  function load(program: DemoProgram) {
    const language = demoLanguageFor(program, file?.language);
    editor.replaceAll(program.texts[language] ?? '');
    if (language !== file?.language) editor.setLanguage?.(language); // renames main.py to Main.java etc. and recolours
    setOpen(false);
  }

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
          {DEMO_PROGRAMS.map((p) => (
            <button key={p.id} role="menuitem" className="btn btn-outline btn-sm btn-block" style={{ justifyContent: 'flex-start', border: 0, textTransform: 'capitalize' }}
              onClick={() => load(p)}>
              {p.label}
              {demoLanguageFor(p, file?.language) !== file?.language && file ? <span style={{ marginLeft: 6, color: 'var(--muted)', textTransform: 'none' }}>(Python)</span> : null}
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
