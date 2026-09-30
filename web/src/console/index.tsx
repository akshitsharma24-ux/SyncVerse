/**
 * Lane B (Simrit): P-B2 console panel (Run, stdin, stdout/stderr, status badge, last five runs).
 * STUB from P-A1. Contract: after a run finishes call useWorkspace().setLastRun(result) so Lane C/D can read it.
 * The "wiring check" below proves the editor contract works; delete it when you build the real panel.
 */
import { useEditor, useSessionUser, useWorkspace } from '../session';
import { PanelStub } from '../PanelStub';

export function RunPanel() {
  const editor = useEditor();
  const me = useSessionUser();
  const { lastRun } = useWorkspace();
  return (
    <PanelStub lane="B" title="Console" task="P-B2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className="btn btn-outline btn-sm" onClick={() => alert(`editor text is ${editor.getValue().length} chars, I am ${me.name} in room ${me.roomCode}`)}>
          Wiring check: read editor
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => editor.highlightLine(4)}>
          highlight line 4
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => editor.highlightLine(null)}>
          clear
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => editor.setMarkers([{ line: 4, message: 'demo marker', severity: 'error' }])}>
          marker line 4
        </button>
        <span style={{ color: 'var(--muted)' }}>lastRun: {lastRun ? lastRun.status : 'none'}</span>
      </div>
    </PanelStub>
  );
}

export default RunPanel;

