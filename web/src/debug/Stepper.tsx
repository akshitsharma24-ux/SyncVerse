/**
 * The step-through debugger's view, for your own code and for a student's code when you are their mentor. It replays a trace like an
 * IDE debugger: the current line, every variable with how it changed (a loop variable shows 0 → 1 → 2 → 3), the call stack and the
 * output so far. Works on correct code and on code that fails (it stops on the error and says which line).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buildFrames, variableHistory, type DebugTrace } from '@syncverse/shared';
import { Icon } from '../shell/icons';
import './stepper.css';

const SPEEDS = [
  { id: 'slow', label: 'Slow', ms: 1100 },
  { id: 'normal', label: 'Normal', ms: 550 },
  { id: 'fast', label: 'Fast', ms: 200 },
] as const;

const HISTORY_SHOWN = 8;

export function Stepper({
  trace,
  at,
  onAt,
  mode,
  ownerName,
  live,
  following,
  onFollow,
  onStop,
  sourceChanged,
}: {
  trace: DebugTrace;
  at: number;
  onAt: (step: number) => void;
  mode: 'own' | 'watch';
  ownerName?: string;
  /** watch mode: the step the student is on right now */
  live?: number;
  following?: boolean;
  onFollow?: (follow: boolean) => void;
  onStop?: () => void;
  /** the shared editor no longer holds the code that was traced */
  sourceChanged?: boolean;
}) {
  const frames = useMemo(() => buildFrames(trace), [trace]);
  const last = Math.max(0, frames.length - 1);
  const index = Math.min(Math.max(at, 0), last);
  const frame = frames[index];
  const lines = useMemo(() => trace.source.split('\n'), [trace.source]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['id']>('normal');
  const [note, setNote] = useState<string | null>(null);
  const codeRef = useRef<HTMLOListElement>(null);

  const firstError = useMemo(() => {
    const i = frames.findIndex((f) => f.step.e);
    return i >= 0 ? i : trace.error ? last : -1;
  }, [frames, trace.error, last]);
  const hits = useMemo(() => {
    const counts = new Map<number, number>();
    for (const f of frames) if (!f.step.r && !f.step.e) counts.set(f.step.l, (counts.get(f.step.l) ?? 0) + 1);
    return counts;
  }, [frames]);

  // A new trace starts paused at the beginning.
  useEffect(() => {
    setPlaying(false);
    setNote(null);
  }, [trace.id]);

  // Play: one step per tick, stop at the end.
  const atRef = useRef(index);
  atRef.current = index;
  useEffect(() => {
    if (!playing) return;
    const ms = SPEEDS.find((s) => s.id === speed)?.ms ?? 550;
    const timer = setInterval(() => {
      if (atRef.current >= last) return setPlaying(false);
      onAt(atRef.current + 1);
    }, ms);
    return () => clearInterval(timer);
  }, [playing, speed, last, onAt]);
  useEffect(() => {
    if (index >= last) setPlaying(false);
  }, [index, last]);

  // Keep the current line in view in the code box.
  useEffect(() => {
    const el = codeRef.current?.querySelector<HTMLElement>('[data-current="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [index]);

  if (!frame) {
    // Nothing ran: a syntax error stops the program before its first line.
    return (
      <div className="dbg" data-testid="dbg-empty">
        <p className="dbg-muted">{trace.error ? 'The program could not start, so there is nothing to step through.' : 'The program did not run any line. Check that the file has code, then debug again.'}</p>
        {trace.error && (
          <div className="dbg-error" role="alert" data-testid="dbg-error">
            <b>{trace.error.type}</b>: {trace.error.message}
            {trace.error.line ? <> <span>on line {trace.error.line}</span></> : null}
          </div>
        )}
      </div>
    );
  }

  const move = (to: number) => {
    onFollow?.(false);
    onAt(Math.max(0, Math.min(last, to)));
  };
  /** "Run to this line": the next step on that line after this one, or the first one. */
  const runToLine = (line: number) => {
    let found = frames.findIndex((f, i) => i > index && f.step.l === line && !f.step.r && !f.step.e);
    if (found < 0) found = frames.findIndex((f) => f.step.l === line && !f.step.r && !f.step.e);
    if (found < 0) return setNote(`Line ${line} never runs in this trace.`);
    setNote(null);
    move(found);
  };

  const step = frame.step;
  const atEnd = index === last;
  const description = step.e
    ? `Raises ${step.e}`
    : step.r !== undefined
      ? `Returns ${step.r} from ${step.f === '<module>' ? 'the program' : `${step.f}()`}`
      : atEnd && !trace.error
        ? 'The program has finished'
        : `About to run line ${step.l}`;
  const names = Object.keys(frame.vars);
  const showError = trace.error && firstError >= 0 && index >= firstError;
  const liveLine = mode === 'watch' && live !== undefined ? frames[Math.min(live, last)]?.step.l : undefined;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest('select, input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(index - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(last);
    else return;
    e.preventDefault();
  };

  return (
    <div className="dbg" data-testid={mode === 'own' ? 'dbg-own' : 'dbg-watch'} onKeyDown={onKey} data-step={index} data-steps={frames.length} data-line={step.l}>
      <header className="dbg-head">
        <div>
          <span className={`dbg-state ${trace.error ? 'error' : 'ok'}`} data-testid="dbg-state">{trace.error ? `Stops with ${trace.error.type}` : 'Runs to the end'}</span>
          <span className="dbg-count mono">{frames.length} steps{trace.truncated ? ' (limit reached)' : ''}</span>
        </div>
        {mode === 'own' && onStop && <button type="button" className="dbg-link" onClick={onStop} data-testid="dbg-stop">Stop debugging</button>}
        {mode === 'watch' && <span className="dbg-count">{ownerName}'s session</span>}
      </header>

      {mode === 'watch' && (
        <div className={`dbg-live ${following ? 'on' : ''}`} data-testid="dbg-live">
          {following ? (
            <span><i aria-hidden="true" /> Following {ownerName} live: step {Math.min(live ?? 0, last) + 1}{liveLine ? `, line ${liveLine}` : ''}</span>
          ) : (
            <>
              <span>You are stepping on your own. {ownerName} is on step {Math.min(live ?? 0, last) + 1}.</span>
              <button type="button" className="dbg-link" onClick={() => onFollow?.(true)} data-testid="dbg-follow">Follow {ownerName}</button>
            </>
          )}
        </div>
      )}
      {sourceChanged && <p className="dbg-warn" role="status" data-testid="dbg-source-changed">The code in the editor changed after this trace, so the line is not marked there. The code below is what was traced.</p>}
      {trace.truncated && <p className="dbg-warn" role="status">The program ran longer than the debugger records, so only the first {frames.length} steps are here (an infinite loop looks like this).</p>}

      <div className="dbg-controls" role="group" aria-label="Step controls">
        <button type="button" onClick={() => move(0)} disabled={index === 0} aria-label="First step" title="First step (Home)" data-testid="dbg-first"><Icon name="skipback" size={14} /></button>
        <button type="button" onClick={() => move(index - 1)} disabled={index === 0} aria-label="Step back" title="Step back (Left arrow)" data-testid="dbg-back"><Icon name="stepback" size={14} /></button>
        <button type="button" className="primary" onClick={() => move(index + 1)} disabled={atEnd} aria-label="Next step" title="Next step (Right arrow)" data-testid="dbg-next"><Icon name="stepforward" size={14} /> <span>Step</span></button>
        <button type="button" onClick={() => move(last)} disabled={atEnd} aria-label="Last step" title="Last step (End)" data-testid="dbg-last"><Icon name="skipforward" size={14} /></button>
        <button type="button" onClick={() => { onFollow?.(false); setPlaying((p) => !p); }} disabled={atEnd && !playing} aria-pressed={playing} aria-label={playing ? 'Pause' : 'Play'} data-testid="dbg-play"><Icon name={playing ? 'pause' : 'play'} size={14} /></button>
        <select value={speed} onChange={(e) => setSpeed(e.target.value as typeof speed)} aria-label="Play speed" data-testid="dbg-speed">
          {SPEEDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {showError === false && firstError >= 0 && (
          <button type="button" className="danger" onClick={() => move(firstError)} data-testid="dbg-jump-error">Jump to the error</button>
        )}
      </div>

      <label className="dbg-slider">
        <span>Step <b data-testid="dbg-position">{index + 1}</b> of {frames.length}</span>
        <input type="range" min={0} max={last} value={index} onChange={(e) => move(Number(e.target.value))} aria-label="Step position" data-testid="dbg-slider" />
      </label>

      <p className={`dbg-desc ${step.e ? 'error' : ''}`} role="status" data-testid="dbg-desc">
        <b>{description}</b>
        {step.f !== '<module>' && <span className="dbg-where"> in {step.f}()</span>}
      </p>

      <ol className="dbg-code" ref={codeRef} aria-label="Program code" data-testid="dbg-code">
        {lines.map((text, i) => {
          const n = i + 1;
          const current = n === step.l;
          const count = hits.get(n);
          return (
            <li key={n} data-current={current} data-line={n} className={`${current ? 'current' : ''} ${step.e && current ? 'error' : ''} ${liveLine === n && !following ? 'live' : ''}`}>
              <button type="button" className="n" onClick={() => runToLine(n)} aria-label={`Run to line ${n}`} title={count ? `Run to line ${n} (runs ${count} time${count === 1 ? '' : 's'})` : `Line ${n} does not run`} data-testid={`dbg-line-${n}`}>{n}</button>
              <code>{text || ' '}</code>
              {count ? <span className="hits" aria-hidden="true">{count > 1 ? `×${count}` : ''}</span> : null}
            </li>
          );
        })}
      </ol>
      {note && <p className="dbg-muted" role="status">{note}</p>}

      {showError && trace.error && (
        <div className="dbg-error" role="alert" data-testid="dbg-error">
          <b>{trace.error.type}</b>: {trace.error.message}
          {trace.error.line ? <> <span>on line {trace.error.line}</span></> : null}
        </div>
      )}

      <section aria-label="Variables">
        <h4>Variables {step.f === '<module>' ? '' : <span>in {step.f}()</span>}</h4>
        {names.length === 0 ? (
          <p className="dbg-muted" data-testid="dbg-no-vars">No variables yet.</p>
        ) : (
          <ul className="dbg-vars" data-testid="dbg-vars">
            {names.map((name) => {
              const history = variableHistory(frames, index, name);
              const changed = frame.changed.includes(name);
              return (
                <li key={name} data-name={name} data-changed={changed || undefined}>
                  <span className="name mono">{name}</span>
                  <span className="val mono" data-testid={`dbg-var-${name}`}>{frame.vars[name]}{changed && <span className="chg" role="img" title="changed in this step" aria-label="changed in this step" />}</span>
                  {history.length > 1 && (
                    <ol className="hist" aria-label={`Values of ${name} so far`} data-testid={`dbg-hist-${name}`}>
                      {history.length > HISTORY_SHOWN && <li className="more">…</li>}
                      {history.slice(-HISTORY_SHOWN).map((v, i, shown) => <li key={i} className={i === shown.length - 1 ? 'now mono' : 'mono'}>{v}</li>)}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Call stack">
        <h4>Call stack</h4>
        <ol className="dbg-stack" data-testid="dbg-stack">
          {[...frame.stack].reverse().map((s, i) => (
            <li key={`${s.id}-${i}`} className={i === 0 ? 'top' : ''}>{s.f === '<module>' ? 'the program' : `${s.f}()`} <span className="mono">line {s.line}</span></li>
          ))}
        </ol>
      </section>

      <section aria-label="Output so far">
        <h4>Output so far</h4>
        {frame.out ? <pre className="dbg-out mono" data-testid="dbg-out">{frame.out}</pre> : <p className="dbg-muted" data-testid="dbg-out-empty">Nothing printed yet.</p>}
      </section>
    </div>
  );
}
