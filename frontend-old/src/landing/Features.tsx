/** The bordered grid of six feature cells under the entry page hero. Each has a small drawn example, not an icon. */
import type { ReactNode } from 'react';
import { Icon } from '../shell/icons';

const dot = (c: string, s = 8) => <i style={{ width: s, height: s, borderRadius: '50%', background: c, display: 'inline-block', flex: 'none' }} />;
const bar = (w: string, c = 'var(--bar)') => <i style={{ display: 'block', height: 7, borderRadius: 2, background: c, width: w }} />;
const tag = (text: string, c: string) => (
  <span style={{ display: 'inline-block', background: c, color: '#fff', font: '600 9.5px/14px var(--font-sans)', padding: '0 5px', borderRadius: '3px 3px 3px 0' }}>{text}</span>
);

function Visual({ children }: { children: ReactNode }) {
  return <div className="cell-visual">{children}</div>;
}

const CELLS: Array<{ title: string; body: string; visual: ReactNode }> = [
  {
    title: 'Edit together',
    body: 'Live cursors, names and presence. Everyone types at once and nothing gets overwritten.',
    visual: (
      <div style={{ display: 'grid', gap: 9, paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{bar('46%')}{tag('Ravi', '#1f5fbf')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 18 }}>{bar('34%')}{bar('12%', 'var(--bar-2)')}{tag('Mei', '#26794f')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{bar('58%')}</div>
      </div>
    ),
  },
  {
    title: 'Run on your own',
    body: 'Same code, your own input, your own output. Nobody else sees your console.',
    visual: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
        {[['3 4 5', '4.0'], ['9', '9.0']].map(([i, o], k) => (
          <div key={k} style={{ border: '1px solid var(--rule-soft)', borderRadius: 3, padding: '6px 7px', lineHeight: 1.5 }}>
            <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="lock" size={10} />stdin {i}</div>
            <div>{o}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Errors in plain English',
    body: 'Explain with AI points to the line and says why. You accept or reject the fix.',
    visual: (
      <div style={{ display: 'grid', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
        <div style={{ background: 'var(--err-bg)', boxShadow: 'inset 3px 0 0 var(--danger)', padding: '2px 8px' }}>total += nums[i]</div>
        <div style={{ border: '1px solid var(--rule-soft)', borderRadius: 3, padding: '5px 8px', fontFamily: 'var(--font-sans)', color: 'var(--ink-2)' }}>
          Loop ran one step too far. <b style={{ color: 'var(--ink)' }}>Accept patch</b>
        </div>
      </div>
    ),
  },
  {
    title: 'Help, by invitation',
    body: 'A mentor asks to see your session. You decide, and you can take it back any time.',
    visual: (
      <div style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--ink-2)' }}>
        <div><b>Asha</b> wants to view your session</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span style={{ background: 'var(--ink)', color: 'var(--on-ink)', borderRadius: 3, padding: '3px 10px' }}>Allow</span>
          <span style={{ border: '1px solid var(--ink)', borderRadius: 3, padding: '2px 10px' }}>Deny</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Talk in the same tab',
    body: 'Video, screen share and chat sit beside the editor. No second window.',
    visual: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, height: '100%' }}>
        {['#1f5fbf', '#26794f', '#6b4fbb', '#b8531b'].map((c, i) => (
          <div key={c} style={{ background: 'var(--tile)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i style={{ width: 20, height: 20, borderRadius: '50%', background: c, display: 'block', opacity: i === 3 ? 0.45 : 1 }} />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'See your own progress',
    body: 'Observations like “2 of 3 loop checks passed”. Never scores, never rankings.',
    visual: (
      <div style={{ display: 'grid', gap: 8 }}>
        {[['loops', '66%'], ['lists', '90%'], ['recursion', '30%']].map(([n, w]) => (
          <div key={n} style={{ display: 'grid', gridTemplateColumns: '58px 1fr', alignItems: 'center', fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {n}
            <i style={{ display: 'block', height: 7, borderRadius: 2, background: 'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 4px)', width: w }} />
          </div>
        ))}
      </div>
    ),
  },
];

export function Features() {
  return (
    <div className="cells" id="features">
      {CELLS.map((c) => (
        <div className="cell" key={c.title}>
          <Visual>{c.visual}</Visual>
          <h3>{c.title}</h3>
          <p>{c.body}</p>
        </div>
      ))}
    </div>
  );
}

