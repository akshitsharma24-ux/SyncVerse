/** The two ways the Debug tool shows the step-through debugger: your own code, and a student's code for a mentor who was allowed in. */
import { useEffect, useState } from 'react';
import { useEditor } from '../session';
import { Icon } from '../shell/icons';
import { Stepper } from './Stepper';
import { useDebugger } from './stepper-context';

/** True while the shared editor no longer holds `source` (checked twice a second: the editor has no change event for other lanes). */
function useEditorDiffers(source: string | undefined): boolean {
  const editor = useEditor();
  const [differs, setDiffers] = useState(false);
  useEffect(() => {
    if (source === undefined) return;
    const check = () => setDiffers(editor.getValue() !== source);
    check();
    const t = setInterval(check, 500);
    return () => clearInterval(t);
  }, [editor, source]);
  return differs;
}

export function OwnStepper() {
  const { own, start, setOwnAt, stop, canDebug } = useDebugger();
  const differs = useEditorDiffers(own.trace?.source);
  // The marker is a tracked decoration that would swell over the whole file if the text were replaced (a patch, the Samples menu),
  // so it is removed as soon as the editor no longer holds the traced code, and comes back if it does again.
  const editor = useEditor();
  useEffect(() => {
    const line = own.trace?.steps[own.at]?.l;
    editor.stepLine?.(own.trace && line && !differs ? line : null);
  }, [editor, own.trace, own.at, differs]);
  return (
    <section className="dbg-own" aria-label="Step through your code" data-testid="debugger">
      {own.trace ? (
        <>
          <Stepper trace={own.trace} at={own.at} onAt={setOwnAt} mode="own" onStop={stop} sourceChanged={differs} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void start()} disabled={own.busy || !canDebug} data-testid="debug-again">
              <Icon name="bug" size={13} /> {own.busy ? 'Debugging…' : 'Debug the current code again'}
            </button>
          </div>
        </>
      ) : (
        <div className="dbg-intro" data-testid="dbg-intro">
          <h3><Icon name="bug" size={15} /> Step through your code</h3>
          <p>Run your program one line at a time and watch every variable change, like the debugger in an IDE: a loop variable goes 0, 1, 2, 3 and you see it happen. It works on code that runs fine and on code that fails. Your debugging stays private unless you allow someone in below.</p>
          <button type="button" className="btn" onClick={() => void start()} disabled={own.busy || !canDebug} data-testid="debug-start">
            <Icon name="bug" size={14} /> {own.busy ? 'Debugging…' : 'Debug my code'}
          </button>
          {!canDebug && <p>Step-through works for Python files. Change the open file's language to Python to use it; Run works in every language.</p>}
        </div>
      )}
      {own.error && <p className="dbg-error" role="alert" data-testid="dbg-run-error" style={{ margin: '8px 0 0' }}>{own.error}</p>}
    </section>
  );
}

export function WatchStepper({ ownerId, ownerName }: { ownerId: string; ownerName: string }) {
  const { watch, loadWatch } = useDebugger();
  const w = watch[ownerId];
  const [at, setAt] = useState(0);
  const [follow, setFollow] = useState(true);
  const differs = useEditorDiffers(w?.trace?.source);

  useEffect(() => {
    void loadWatch(ownerId, ownerName);
  }, [ownerId, ownerName, loadWatch]);

  // A new trace: start following the student again. While following, move with them.
  const traceId = w?.trace?.id;
  useEffect(() => setFollow(true), [traceId]);
  useEffect(() => {
    if (follow && w?.trace) setAt(w.live);
  }, [follow, w?.live, w?.trace]);

  // Mark the step's line in my editor too (the room shares one file), while this trace is on screen.
  const editor = useEditor();
  const watched = w?.trace;
  useEffect(() => {
    const line = watched?.steps[at]?.l;
    editor.stepLine?.(watched && line && editor.getValue() === watched.source ? line : null);
    return () => editor.stepLine?.(null);
  }, [editor, watched, at, differs]);

  return (
    <section aria-label={`${ownerName}'s debugger`} data-testid="debugger-watch" style={{ marginTop: 8 }}>
      {w?.trace ? (
        <Stepper trace={w.trace} at={at} onAt={setAt} mode="watch" ownerName={ownerName} live={w.live} following={follow} onFollow={setFollow} sourceChanged={differs} />
      ) : (
        <p className="dbg-muted" data-testid="dbg-watch-empty">
          {w?.error ?? (w?.loading ? 'Looking for their debug session…' : `${ownerName} has not stepped through any code yet. You will get a notice the moment they start, and you will follow along live.`)}
        </p>
      )}
    </section>
  );
}
