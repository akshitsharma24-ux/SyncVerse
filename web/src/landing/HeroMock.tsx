/**
 * The entry page's live mock editor. It plays one loop of the product story:
 * a bug, two labelled cursors, a private run that fails, a plain-English explanation, the fix, a clean run.
 * Reduced-motion users get the still frame at the most informative moment (error + explanation).
 */
import { useEffect, useState } from 'react';

const STEP_MS = 1600;
const STEPS = 6;
const BLUE = '#1f5fbf';
const GREEN = '#2e8b5e';
const ORANGE = '#d9692b';

// [line, column] of each person's caret at each step
const RAVI: Array<[number, number]> = [[2, 13], [7, 25], [4, 24], [3, 32], [3, 28], [3, 28]];
const MEI: Array<[number, number]> = [[5, 28], [5, 28], [5, 28], [1, 18], [7, 25], [7, 25]];

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

function Caret({ at, color, name }: { at: [number, number]; color: string; name: string }) {
  return (
    <span className="cursor" style={{ color, top: 10 + (at[0] - 1) * 22 + 2, left: `calc(38px + ${at[1]}ch)` }}>
      <b style={{ background: color }}>{name}</b>
    </span>
  );
}

export function HeroMock() {
  const reduce = usePrefersReducedMotion();
  const [step, setStep] = useState(reduce ? 3 : 0);
  useEffect(() => {
    if (reduce) {
      setStep(3);
      return;
    }
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS), STEP_MS);
    return () => clearInterval(t);
  }, [reduce]);

  const fixed = step >= 4;
  const failed = step === 2 || step === 3;
  const running = step === 1;

  return (
    <div className="ide" role="img" aria-label="Animated example: two students edit one Python file, a run fails, an explanation appears, and the bug is fixed.">
      {/* window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px', borderBottom: '1px solid var(--rule-soft)', background: 'var(--paper-2)' }}>
        <span style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <i key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'block' }} />
          ))}
        </span>
        <span style={{ margin: '0 auto', color: 'var(--muted)', fontSize: 12 }}>main.py — loops-101</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>
          <i style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'block' }} />3 in room
        </span>
      </div>

      <div className="ide-grid">
        {/* sidebar */}
        <aside className="ide-side" style={{ borderRight: '1px solid var(--rule-soft)', padding: '12px 12px', background: 'var(--paper-2)', fontSize: 12 }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>files</div>
          {['main.py', 'utils.py', 'notes.md'].map((f, i) => (
            <div key={f} style={{ padding: '3px 6px', margin: '0 -6px', borderRadius: 3, background: i === 0 ? '#e8e5dc' : 'transparent', color: i === 0 ? 'var(--ink)' : 'var(--muted)' }}>
              {f}
            </div>
          ))}
          <div className="eyebrow" style={{ fontSize: 10, margin: '16px 0 6px' }}>people</div>
          {[
            { n: 'Ravi', c: BLUE, s: running ? 'running' : fixed ? 'fixed it' : 'typing' },
            { n: 'Mei', c: GREEN, s: 'editing' },
            { n: 'Asha', c: ORANGE, s: step >= 3 ? 'viewing' : 'mentor' },
          ].map((p) => (
            <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: p.c, display: 'block', flex: 'none' }} />
              <span>{p.n}</span>
              <span style={{ color: 'var(--soft)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{p.s}</span>
            </div>
          ))}
        </aside>

        {/* code */}
        <div style={{ minWidth: 0 }}>
          <div className="ide-code">
            <div className="ide-line"><i>1</i><span><span className="tok-kw">def</span> <span className="tok-fn">average</span>(nums):</span></div>
            <div className="ide-line"><i>2</i><span>    total = <span className="tok-num">0</span></span></div>
            <div className="ide-line">
              <i>3</i>
              <span>
                {'    '}
                <span className="tok-kw">for</span> i <span className="tok-kw">in</span> <span className="tok-fn">range</span>(<span className="tok-fn">len</span>(nums){fixed ? '' : ' + 1'}):
              </span>
            </div>
            <div className={'ide-line' + (failed ? ' err' : '')}><i>4</i><span>        total += nums[i]</span></div>
            <div className="ide-line"><i>5</i><span>    <span className="tok-kw">return</span> total / <span className="tok-fn">len</span>(nums)</span></div>
            <div className="ide-line"><i>6</i><span> </span></div>
            <div className="ide-line"><i>7</i><span><span className="tok-fn">print</span>(<span className="tok-fn">average</span>([<span className="tok-num">3</span>, <span className="tok-num">4</span>, <span className="tok-num">5</span>]))</span></div>
            <Caret at={RAVI[step]} color={BLUE} name="Ravi" />
            <Caret at={MEI[step]} color={GREEN} name="Mei" />
          </div>

          {/* console + explanation */}
          <div className="ide-bottom">
            <div style={{ padding: '10px 14px', borderRight: '1px solid var(--rule-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="eyebrow" style={{ fontSize: 10 }}>your console · only you</span>
                {failed && <span style={{ fontSize: 10.5, color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 9, padding: '0 7px' }}>Runtime error</span>}
                {fixed && <span style={{ fontSize: 10.5, color: 'var(--ok)', border: '1px solid var(--ok)', borderRadius: 9, padding: '0 7px' }}>Success · 12 ms</span>}
              </div>
              <div style={{ color: 'var(--muted)' }}>$ python main.py &lt; 3 4 5</div>
              {running && <div style={{ color: 'var(--muted)' }}>running…</div>}
              {failed && (
                <>
                  <div style={{ color: 'var(--danger)' }}>IndexError: list index out of range</div>
                  <div style={{ color: 'var(--soft)' }}>  File "main.py", line 4</div>
                </>
              )}
              {fixed && <div style={{ color: 'var(--ink)' }}>4.0</div>}
            </div>
            <div style={{ padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.45, color: 'var(--ink-2)' }}>
              {step >= 3 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="eyebrow" style={{ fontSize: 10, color: 'var(--lane-c)' }}>explain with ai</span>
                    {fixed && <span style={{ fontSize: 10.5, color: 'var(--ok)' }}>patch accepted</span>}
                  </div>
                  <div><b>The loop ran one step too far.</b> <span className="mono" style={{ fontSize: 11 }}>range(len(nums) + 1)</span> reaches index 3, but the list only has positions 0 to 2.</div>
                </>
              ) : (
                <div style={{ color: 'var(--soft)', paddingTop: 22 }}>Errors get explained here, in plain English.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



