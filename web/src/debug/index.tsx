/**
 * Lane D (Miti): P-D1 permission-gated debug access (request / allow / revoke, read-only mirror of the owner's run).
 * STUB from P-A1. usePresence() lists who is in the room.
 */
import { usePresence } from '../session';
import { PanelStub } from '../PanelStub';

export function DebugPanel() {
  const people = usePresence();
  return (
    <PanelStub lane="D" title="Debug access" task="P-D1">
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        people in room: {people.length === 0 ? 'none reported yet (presence arrives in P-A3)' : people.map((p) => p.name).join(', ')}
      </div>
    </PanelStub>
  );
}

export default DebugPanel;
