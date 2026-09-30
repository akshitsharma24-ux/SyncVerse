/** Placeholder shown by every panel until its task lands. The lane owner deletes the usage in their own folder. */
import type { ReactNode } from 'react';

const LANES = {
  A: { color: 'var(--lane-a)', owner: 'Akshit' },
  B: { color: 'var(--lane-b)', owner: 'Simrit' },
  C: { color: 'var(--lane-c)', owner: 'Rahil' },
  D: { color: 'var(--lane-d)', owner: 'Miti' },
} as const;

export function PanelStub({
  lane,
  title,
  task,
  children,
}: {
  lane: keyof typeof LANES;
  title: string;
  task: string;
  children?: ReactNode;
}) {
  const l = LANES[lane];
  return (
    <div
      style={{
        border: '1px dashed var(--soft)',
        borderRadius: 4,
        padding: 14,
        background: 'repeating-linear-gradient(135deg, var(--hatch-soft) 0 1px, transparent 1px 7px)',
      }}
    >
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <i style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: 'inline-block' }} />
        Lane {lane} · {l.owner} · {task}
      </div>
      <div style={{ fontSize: 15, fontWeight: 550, letterSpacing: '-0.01em', margin: '8px 0 4px' }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>Not built yet. {l.owner} replaces this panel when {task} lands.</div>
      {children && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}
