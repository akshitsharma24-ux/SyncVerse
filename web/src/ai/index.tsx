/** Lane C P-C2/P-C3: explain a failed run and review a collaborative patch. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { Explanation, RunResult } from '@syncverse/shared';
import { ApiError, api } from '../api';
import { useEditor, useSessionUser, useWorkspace } from '../session';
import { Icon } from '../shell/icons';
import { HintLadder, type HintSet, type Tier } from './HintLadder';

const DEMO_RUN_ID = 'syncverse-ai-demo-typeerror';
const DEMO_SOURCE = 'scores = ["4"]\ntotal = scores[0] + 1\nprint(total)';

interface PatchPreview {
  runId: string;
  language: string;
  baseSource: string;
  patchedSource: string;
  summary: string;
  sourceChangedSinceRun: boolean;
  source: 'sample' | 'gemini';
}

const STATUS_LABEL: Record<RunResult['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  success: 'Success',
  compile_error: 'Compile error',
  runtime_error: 'Runtime error',
  timeout: 'Timed out',
  memory_limit: 'Memory limit',
  service_error: 'Runner unavailable',
};

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.body && typeof error.body === 'object') {
      const body = error.body as Record<string, unknown>;
      if (body.code === 'ai_not_configured') {
        return 'Gemini is not configured yet. Add the key to LLM_API_KEY in the server .env file. Pre-seeded sample explanations are available once run records are connected.';
      }
      if (body.code === 'run_not_found') {
        return 'The run service did not return this run to the AI gateway. Once Lane B run records are available, try again.';
      }
      if (typeof body.error === 'string') return body.error;
    }
    return error.status === 404 ? 'The run could not be found.' : 'The explanation could not be loaded. Please try again.';
  }
  return error instanceof Error ? error.message : 'The explanation could not be loaded. Please try again.';
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 11 }}>
      <div className="eyebrow" style={{ marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>{children}</div>
    </section>
  );
}

function RunError({ run }: { run: RunResult }) {
  const detail = run.errorMessage || run.stderr || run.compileOutput;
  const isDemo = run.id === DEMO_RUN_ID;
  return (
    <div style={{ border: '1px solid var(--rule-soft)', padding: 12, background: 'var(--paper-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="eyebrow">{isDemo ? 'Example · not executed' : 'Latest run'}</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--danger)' }}>{STATUS_LABEL[run.status]}</span>
      </div>
      <div style={{ marginTop: 7, fontSize: 13, fontWeight: 550 }}>
        {run.errorLine ? `Error reported on line ${run.errorLine}` : 'The program did not finish successfully'}
      </div>
      {detail && (
        <details style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
          <summary style={{ cursor: 'pointer' }}>Show run message</summary>
          <pre style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: '11px/1.5 var(--font-mono)' }}>
            {detail.slice(-1200)}
          </pre>
        </details>
      )}
    </div>
  );
}

function PatchDiff({ preview }: { preview: PatchPreview }) {
  const container = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!container.current) return;
    const original = monaco.editor.createModel(preview.baseSource, preview.language);
    const modified = monaco.editor.createModel(preview.patchedSource, preview.language);
    const diff = monaco.editor.createDiffEditor(container.current, {
      // Monaco's theme is global: follow the page theme, or opening the preview would flip the main editor to light in dark mode.
      theme: document.documentElement.dataset.theme === 'dark' ? 'syncverse-dark' : 'syncverse',
      readOnly: true, originalEditable: false, renderSideBySide: true,
      automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
    });
    const viewModel = diff.createViewModel({ original, modified });
    diff.setModel(viewModel);
    diff.getOriginalEditor().updateOptions({ ariaLabel: 'Original code' });
    diff.getModifiedEditor().updateOptions({ ariaLabel: 'Suggested code' });
    return () => {
      // Own the view model so pending diff work is cancelled before its text models disappear.
      diff.setModel(null);
      viewModel.dispose();
      diff.dispose();
      original.dispose();
      modified.dispose();
    };
  }, [preview.baseSource, preview.patchedSource, preview.language]);
  return <div ref={container} style={{ height: '100%', width: '100%' }} />;
}

export function AIPanel() {
  const { lastRun, setLastRun } = useWorkspace();
  const editor = useEditor();
  const session = useSessionUser();
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchPreview, setPatchPreview] = useState<PatchPreview | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [patchStale, setPatchStale] = useState(false);
  const [patchFeedback, setPatchFeedback] = useState<string | null>(null);
  // The optional hint ladder (a nudge, a guiding question, then the fix). Separate from the direct explanation above it.
  const [hintMode, setHintMode] = useState(false);
  const [hints, setHints] = useState<HintSet | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintTier, setHintTier] = useState<Tier>(0);
  const requestSequence = useRef(0);
  const patchSequence = useRef(0);
  const hintSequence = useRef(0);

  useEffect(() => {
    requestSequence.current += 1;
    hintSequence.current += 1;
    setHintMode(false);
    setHints(null);
    setHintLoading(false);
    setHintError(null);
    setHintTier(0);
    setLoading(false);
    setExplanation(null);
    setError(null);
    patchSequence.current += 1;
    setPatchLoading(false);
    setPatchPreview(null);
    setPatchError(null);
    setPatchStale(false);
    setPatchFeedback(null);
    // Do not clear the editor highlight here: the console (Lane B) sets or clears the error-line highlight itself on every finished run,
    // and clearing it from this effect, which runs right after, would wipe the new run's highlight.
  }, [lastRun?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!patchPreview) return;
    // EditorHandle has no change subscription; observe remote edits while reviewing.
    const checkSource = () => setPatchStale(editor.getValue() !== patchPreview.baseSource);
    checkSource();
    const timer = window.setInterval(checkSource, 200);
    return () => window.clearInterval(timer);
  }, [editor, patchPreview]);

  const explainable = Boolean(lastRun && !['queued', 'running', 'success', 'service_error'].includes(lastRun.status));

  function loadDemoExample() {
    const now = Date.now();
    editor.replaceAll(DEMO_SOURCE);
    setLastRun({
      id: DEMO_RUN_ID,
      ownerId: session.userId,
      roomCode: session.roomCode,
      language: 'python',
      source: DEMO_SOURCE,
      stdin: '',
      status: 'runtime_error',
      stdout: '',
      stderr: 'TypeError: can only concatenate str (not "int") to str',
      compileOutput: '',
      errorLine: 2,
      errorMessage: 'TypeError: can only concatenate str (not "int") to str',
      createdAt: now,
    });
  }

  async function suggestPatch() {
    if (!lastRun || !explainable) return;
    const run = lastRun;
    const source = editor.getValue();
    if (!source.trim()) {
      setPatchError('The shared editor is empty. Add code before requesting a patch.');
      return;
    }
    const sequence = ++patchSequence.current;
    setPatchLoading(true);
    setPatchPreview(null);
    setPatchError(null);
    setPatchStale(false);
    setPatchFeedback(null);
    try {
      const result = await api.post<Omit<PatchPreview, 'runId' | 'language'>>('/api/ai/patch', { runId: run.id, source });
      if (patchSequence.current !== sequence) return;
      setPatchPreview({ ...result, runId: run.id, language: run.language });
      setPatchStale(editor.getValue() !== result.baseSource);
    } catch (err) {
      if (patchSequence.current === sequence) setPatchError(apiErrorMessage(err));
    } finally {
      if (patchSequence.current === sequence) setPatchLoading(false);
    }
  }

  function logPatchDecision(runId: string, accepted: boolean) {
    void api.post<{ ok: true }>('/api/ai/patch/decision', { runId, accepted }).catch(() => {
      setPatchFeedback(accepted
        ? 'Patch applied to the shared editor, but its decision could not be logged.'
        : 'Patch rejected; the editor was unchanged, but the decision could not be logged.');
    });
  }

  function acceptPatch() {
    if (!patchPreview) return;
    if (editor.getValue() !== patchPreview.baseSource) {
      setPatchStale(true);
      return;
    }
    editor.replaceAll(patchPreview.patchedSource);
    logPatchDecision(patchPreview.runId, true);
    setPatchPreview(null);
    setPatchStale(false);
    setPatchFeedback('Patch accepted and applied to the shared editor.');
  }

  function rejectPatch() {
    if (!patchPreview) return;
    const runId = patchPreview.runId;
    setPatchPreview(null);
    setPatchStale(false);
    setPatchFeedback('Patch rejected. The shared editor was not changed.');
    logPatchDecision(runId, false);
  }

  async function explainLatestRun() {
    if (!lastRun || !explainable) return;
    const run = lastRun;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setExplanation(null);
    if (run.errorLine) editor.highlightLine(run.errorLine);

    try {
      const result = await api.post<Explanation>('/api/ai/explain', { runId: run.id });
      if (requestSequence.current !== sequence) return;
      setExplanation(result);
      const line = result.whereLine ?? run.errorLine;
      if (line) editor.highlightLine(line);
    } catch (err) {
      if (requestSequence.current === sequence) setError(apiErrorMessage(err));
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }

  // ------------------------------------------------------------------------------- hint ladder (optional)
  function logHintStep(step: 'question' | 'fix') {
    if (lastRun) void api.post('/api/ai/hints/step', { runId: lastRun.id, step }).catch(() => undefined);
  }

  async function startHints() {
    if (!lastRun || !explainable) return;
    const run = lastRun;
    const sequence = ++hintSequence.current;
    requestSequence.current += 1; // a direct explanation still loading is no longer wanted
    setLoading(false);
    setExplanation(null);
    setError(null);
    setHintMode(true);
    setHints(null);
    setHintError(null);
    setHintTier(1);
    setHintLoading(true);
    if (run.errorLine) editor.highlightLine(run.errorLine);
    try {
      const result = await api.post<{ hints: { nudge: string; question: string }; source: HintSet['source'] }>('/api/ai/hints', { runId: run.id });
      if (hintSequence.current !== sequence) return;
      setHints({ ...result.hints, source: result.source });
    } catch (err) {
      if (hintSequence.current === sequence) setHintError(apiErrorMessage(err));
    } finally {
      if (hintSequence.current === sequence) setHintLoading(false);
    }
  }

  function nextHint() {
    setHintTier(2);
    logHintStep('question');
  }

  function showFix() {
    setHintTier(3);
    logHintStep('fix');
    void explainLatestRun();
  }

  function leaveHints() {
    hintSequence.current += 1;
    setHintMode(false);
    setHints(null);
    setHintLoading(false);
    setHintError(null);
    setHintTier(0);
  }

  function skipToDirect() {
    leaveHints();
    void explainLatestRun();
  }

  const fixState = explanation ? 'done' : loading ? 'loading' : error ? 'error' : 'idle';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="ai-panel">
      <header>
        <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--lane-c)' }}>
          <Icon name="sparkle" size={13} /> AI TUTOR
        </div>
        <h2 style={{ margin: '7px 0 3px', fontSize: 18, letterSpacing: '-0.025em', fontWeight: 550 }}>Understand the failure</h2>
        <div style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.45 }}>
          Understand your latest failed run: get the explanation straight away, or work it out yourself with step-by-step hints. Both are optional.
        </div>
      </header>

      {!lastRun && (
        <>
          <div role="status" style={{ border: '1px dashed var(--soft)', padding: 13, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 }}>
            Run a program from the console. If it fails, its explanation will appear here. You can also try the AI flow with a synthetic example.
          </div>
          <div style={{ border: '1px solid var(--rule-soft)', padding: 12, background: 'var(--paper-2)' }}>
            <div className="eyebrow">Try an example</div>
            <p style={{ margin: '6px 0 10px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
              This loads a sample TypeError into the shared editor. It does not execute the code, and everyone in this room will see the editor change.
            </p>
            <button className="btn btn-outline btn-block" type="button" onClick={loadDemoExample} data-testid="ai-load-demo-button">
              Load sample into shared editor
            </button>
          </div>
        </>
      )}

      {lastRun && !explainable && (
        <div role="status" style={{ border: '1px solid var(--rule-soft)', padding: 12, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 }}>
          {lastRun.status === 'success'
            ? 'The latest run succeeded. AI explanations are available when a run fails.'
            : `${STATUS_LABEL[lastRun.status]} — waiting for a completed learner error.`}
        </div>
      )}

      {lastRun && explainable && <RunError run={lastRun} />}

      {lastRun && explainable && hintMode && (
        <HintLadder
          tier={hintTier}
          hints={hints}
          loading={hintLoading}
          error={hintError}
          line={lastRun.errorLine}
          fix={fixState}
          patchLoading={patchLoading}
          onHighlight={() => editor.highlightLine(lastRun.errorLine ?? null)}
          onQuestion={nextHint}
          onFix={showFix}
          onRetryFix={() => void explainLatestRun()}
          onPatch={() => void suggestPatch()}
          onDirect={skipToDirect}
          onExit={leaveHints}
        />
      )}

      {lastRun && explainable && !hintMode && (
        <>
          <button
            className="btn btn-block"
            type="button"
            disabled={loading}
            onClick={explainLatestRun}
            data-testid="ai-explain-button"
          >
            <Icon name="sparkle" size={15} />
            {loading ? 'Explaining…' : error ? 'Try explanation again' : explanation ? 'Explain this run again' : 'Explain with AI'}
          </button>
          <button
            className="btn btn-outline btn-block"
            type="button"
            disabled={patchLoading}
            onClick={suggestPatch}
            data-testid="ai-suggest-patch-button"
          >
            {patchLoading ? 'Preparing patch preview…' : 'Suggest a patch'}
          </button>
          <div className="ai-or" aria-hidden="true">or think it through</div>
          <button className="btn btn-outline btn-block" type="button" onClick={() => void startHints()} data-testid="ai-hint-start">
            <Icon name="bulb" size={15} /> Guide me with hints
          </button>
          <p className="ai-hint-offer">A gentle nudge first, then a guiding question. The fix stays hidden until you ask for it. The buttons above work without any hints.</p>
        </>
      )}

      {loading && <div role="status" aria-live="polite" style={{ color: 'var(--muted)', fontSize: 12 }}>Reading the error and nearby code…</div>}

      {error && (
        <div role="alert" data-testid="ai-explain-error" style={{ borderLeft: '3px solid var(--warn)', padding: '9px 11px', background: 'var(--paper-2)', fontSize: 12.5, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {patchLoading && <div role="status" aria-live="polite" style={{ color: 'var(--muted)', fontSize: 12 }}>Preparing a minimal correction for review…</div>}

      {patchError && (
        <div role="alert" data-testid="ai-patch-error" style={{ borderLeft: '3px solid var(--warn)', padding: '9px 11px', background: 'var(--paper-2)', fontSize: 12.5, lineHeight: 1.5 }}>
          {patchError}
        </div>
      )}

      {patchFeedback && (
        <div role="status" data-testid="ai-patch-feedback" style={{ borderLeft: '3px solid var(--ok)', padding: '9px 11px', background: 'var(--paper-2)', fontSize: 12.5, lineHeight: 1.5 }}>
          {patchFeedback}
        </div>
      )}

      {explanation && (
        <article data-testid="ai-explanation" style={{ display: 'flex', flexDirection: 'column', gap: 11, border: '1px solid var(--rule-soft)', padding: 13, background: 'var(--panel)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div className="eyebrow">What happened</div>
              <div style={{ marginTop: 5, fontSize: 14, fontWeight: 550, lineHeight: 1.4 }}>{explanation.what}</div>
            </div>
            {explanation.whereLine && (
              <button
                className="btn btn-outline btn-sm mono"
                type="button"
                onClick={() => editor.highlightLine(explanation.whereLine ?? null)}
                aria-label={`Highlight line ${explanation.whereLine}`}
                title="Highlight the parser-reported line"
              >
                L{explanation.whereLine}
              </button>
            )}
          </div>

          <Section label="Why it happened">{explanation.why}</Section>
          <Section label="In plain terms">{explanation.plain}</Section>
          <Section label="Try this">{explanation.fix}</Section>

          {explanation.snippet && (
            <pre style={{ margin: 0, padding: 10, background: 'var(--paper-2)', border: '1px solid var(--rule-soft)', overflowX: 'auto', whiteSpace: 'pre-wrap', font: '12px/1.5 var(--font-mono)' }}>
              {explanation.snippet}
            </pre>
          )}

          {explanation.concepts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }} aria-label="Learning concepts">
              {explanation.concepts.map((concept) => (
                <span key={concept} className="mono" style={{ border: '1px solid var(--rule-soft)', padding: '3px 6px', fontSize: 10.5, color: 'var(--muted)' }}>
                  {concept}
                </span>
              ))}
            </div>
          )}
        </article>
      )}

      <div style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 10, color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5 }}>
        AI can be wrong. Check the explanation and review any suggested change before applying it.
      </div>

      {patchPreview && (
        <div role="dialog" aria-modal="true" aria-labelledby="ai-patch-title" data-testid="ai-patch-modal" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vh 3vw', background: 'var(--overlay)' }}>
          <div style={{ width: 'min(1100px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', gap: 12, padding: 18, background: 'var(--panel)', border: '1px solid var(--rule-soft)', boxShadow: '0 18px 70px rgba(0,0,0,.28)' }}>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--lane-c)' }}>
                  {patchPreview.source === 'sample' ? 'SAMPLE PATCH · NOT AI GENERATED' : 'GEMINI PATCH'}
                </div>
                <h2 id="ai-patch-title" style={{ margin: '5px 0', fontSize: 18, fontWeight: 550 }}>Review suggested patch</h2>
                <div style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.45 }}>{patchPreview.summary}</div>
              </div>
              <button className="btn btn-outline btn-sm" type="button" onClick={rejectPatch} aria-label="Reject patch and close preview">Reject</button>
            </header>

            <div style={{ color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.45 }}>
              {patchStale
                ? 'The shared editor changed while this preview was open. Regenerate from the current code before accepting.'
                : patchPreview.sourceChangedSinceRun
                  ? 'This preview was generated from the current editor code; the error details came from an earlier run.'
                  : 'Compare the original and proposed code. Accepting syncs the full corrected source to everyone in this room.'}
            </div>

            <div style={{ height: 'min(58vh, 620px)', minHeight: 260, border: '1px solid var(--rule-soft)' }} data-testid="patch-diff">
              <PatchDiff preview={patchPreview} />
            </div>

            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {patchStale && <button className="btn btn-outline" type="button" onClick={suggestPatch} disabled={patchLoading}>{patchLoading ? 'Regenerating…' : 'Regenerate for current code'}</button>}
              <button className="btn btn-outline" type="button" onClick={rejectPatch} data-testid="patch-reject">Reject patch</button>
              <button className="btn" type="button" onClick={acceptPatch} disabled={patchStale} data-testid="patch-accept">Accept patch</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIPanel;
