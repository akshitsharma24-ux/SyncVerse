/**
 * Lane C (Rahil): P-C2 AI panel and P-C3 patch preview. STUB from P-A1.
 * Reads useWorkspace().lastRun (set by Lane B); highlights lines and applies patches via useEditor().
 */
import { useWorkspace } from '../session';
import { PanelStub } from '../PanelStub';

export function AIPanel() {
  const { lastRun } = useWorkspace();
  return (
    <PanelStub lane="C" title="AI tutor" task="P-C2 / P-C3">
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        last run: {lastRun ? `${lastRun.status}${lastRun.errorLine ? ` (line ${lastRun.errorLine})` : ''}` : 'none yet'}
      </div>
    </PanelStub>
  );
}

export default AIPanel;
