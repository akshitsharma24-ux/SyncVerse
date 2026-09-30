/**
 * Lane B (Simrit): P-B4 quality panel. Sends the shared file to /api/analyze 1.5 s after the text stops changing (or on
 * "Analyze now"), lists the findings grouped by category, jumps to the line on click, and puts the findings in the editor
 * as markers (through ../console/markers, which merges them with the run-error marker). Feedback for learning, not a grade.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Diagnostic } from '@syncverse/shared';
import { api } from '../api';
import { useEditor, useSessionUser } from '../session';
import { apiMessage } from '../console/useRunner';
import { flashLine, publishMarkers } from '../console/markers';
import { useLanguage } from '../console/language';
import './quality.css';

const QUIET_MS = 1500;
const POLL_MS = 500;

const CATEGORIES: { id: Diagnostic['category']; label: string }[] = [
  { id: 'security', label: 'Security' },
  { id: 'smell', label: 'Code smells' },
  { id: 'complexity', label: 'Complexity' },
  { id: 'naming', label: 'Naming' },
  { id: 'formatting', label: 'Formatting' },
];

/** The maintainability summary: what we can actually measure, in words (never a number or a rank). */
const DIMENSIONS: { label: string; rules: string[] }[] = [
  { label: 'Readability', rules: ['line-too-long', 'magic-number'] },
  { label: 'Structure', rules: ['deep-nesting', 'nested-loops'] },
  { label: 'Naming', rules: ['one-letter-name'] },
  { label: 'Safety', rules: ['dangerous-call', 'hardcoded-secret', 'bare-except'] },
];

function dimensionState(findings: Diagnostic[], rules: string[]): { text: string; tone: 'ok' | 'warn' | 'danger'; n: number } {
  const mine = findings.filter((f) => rules.includes(f.rule));
  if (mine.some((f) => f.severity === 'error')) return { text: 'Needs attention', tone: 'danger', n: mine.length };
  if (mine.length === 0) return { text: 'Looks good', tone: 'ok', n: 0 };
  return { text: mine.length >= 3 ? 'Needs attention' : 'Some notes', tone: 'warn', n: mine.length };
}

type Phase = 'idle' | 'waiting' | 'analyzing';

export function QualityPanel() {
  const editor = useEditor();
  const me = useSessionUser();
  const supported = useLanguage() === 'python'; // the checks are Python rules
  const [findings, setFindings] = useState<Diagnostic[] | null>(null); // null = nothing analysed yet
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const alive = useRef(true);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef<string | null>(null); // the editor text the poller saw last

  const analyze = useCallback(
    async (source: string, explicit: boolean) => {
      const mine = ++seq.current;
      if (!source.trim()) {
        setFindings([]);
        setError(null);
        setPhase('idle');
        publishMarkers(editor, 'lint', []);
        return;
      }
      setPhase('analyzing');
      try {
        const list = await api.post<Diagnostic[]>(
          '/api/analyze',
          explicit ? { source, log: true, roomCode: me.roomCode } : { source },
        );
        if (!alive.current || mine !== seq.current) return; // a newer analysis has started
        if (editor.getValue() !== source) {
          setPhase('waiting'); // the text moved on while we were away; the poller has already scheduled a fresh run
          return;
        }
        setFindings(list);
        setError(null);
        setCheckedAt(Date.now());
        setPhase('idle');
        publishMarkers(
          editor,
          'lint',
          list.map((d) => ({ line: d.line, message: d.message, severity: d.severity })),
        );
      } catch (e) {
        if (!alive.current || mine !== seq.current) return;
        setError(apiMessage(e));
        setPhase('idle');
      }
    },
    [editor, me.roomCode],
  );

  // Watch the text (EditorHandle has no change event): after QUIET_MS without a change, analyse.
  useEffect(() => {
    alive.current = true;
    if (!supported) {
      // The analyzer only understands Python: clear everything and do not send anything.
      seq.current++;
      seen.current = null;
      setFindings(null);
      setError(null);
      setPhase('idle');
      publishMarkers(editor, 'lint', []);
      return () => {
        alive.current = false;
      };
    }
    const poll = setInterval(() => {
      const text = editor.getValue();
      if (text === seen.current) return;
      seen.current = text;
      if (timer.current) clearTimeout(timer.current);
      setPhase('waiting');
      timer.current = setTimeout(() => void analyze(text, false), QUIET_MS);
    }, POLL_MS);
    return () => {
      alive.current = false;
      seq.current++; // a response that is still on its way belongs to the old effect: ignore it
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      publishMarkers(editor, 'lint', []);
    };
  }, [editor, analyze, supported]);

  const analyzeNow = () => {
    if (timer.current) clearTimeout(timer.current);
    const text = editor.getValue();
    seen.current = text;
    void analyze(text, true);
  };

  const status =
    phase === 'analyzing'
      ? 'Analyzing…'
      : phase === 'waiting'
        ? 'Waiting for you to stop typing…'
        : checkedAt
          ? `Checked ${new Date(checkedAt).toLocaleTimeString([], { hour12: false })}`
          : '';

  if (!supported) {
    return (
      <div className="q" data-testid="quality-panel">
        <div className="q-empty" data-testid="quality-unsupported">
          Quality checks cover Python only for now. Set the console language back to Python to see them.
        </div>
      </div>
    );
  }

  return (
    <div className="q" data-testid="quality-panel">
      <div className="q-top">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          data-testid="quality-analyze"
          onClick={analyzeNow}
          disabled={phase === 'analyzing'}
        >
          Analyze now
        </button>
        <span className="q-status" data-testid="quality-status" data-phase={phase} role="status">
          {status}
        </span>
      </div>
      <p className="q-note">
        Feedback for learning, not a grade. These are simple checks; they can be wrong, and you decide what to change.
      </p>

      {error && (
        <div className="q-error" role="alert" data-testid="quality-error">
          {error}
        </div>
      )}

      {findings && findings.length > 0 && (
        <div className="q-dims" data-testid="quality-summary">
          {DIMENSIONS.map((d) => {
            const s = dimensionState(findings, d.rules);
            return (
              <div key={d.label} className="q-dim" data-tone={s.tone} data-dimension={d.label}>
                <b>{d.label}</b>
                <span>{s.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {findings === null && !error && <div className="q-empty">Checking your code…</div>}
      {findings && findings.length === 0 && (
        <div className="q-empty" data-testid="quality-empty">
          {editor.getValue().trim()
            ? 'No findings. By these simple checks your code looks clean.'
            : 'Nothing to check yet. Write some code in the editor.'}
        </div>
      )}

      {findings &&
        CATEGORIES.map((c) => {
          const items = findings.filter((f) => f.category === c.id);
          if (items.length === 0) return null;
          return (
            <section key={c.id} className="q-group" data-testid="quality-group" data-category={c.id}>
              <h4 className="q-group-head">
                <span className="eyebrow" style={{ color: 'var(--ink)' }}>
                  {c.label}
                </span>
                <span className="q-count">{items.length}</span>
              </h4>
              <ul className="q-list">
                {items.map((d, i) => (
                  <li key={`${d.rule}-${d.line}-${d.col ?? 0}-${i}`}>
                    <button
                      type="button"
                      className="q-item"
                      data-testid="quality-item"
                      data-rule={d.rule}
                      data-line={d.line}
                      data-sev={d.severity}
                      onClick={() => flashLine(editor, d.line)}
                      title={`Go to line ${d.line}`}
                    >
                      <span className="q-sev" aria-label={d.severity} />
                      <span className="q-line mono">L{d.line}</span>
                      <span>
                        <span className="q-msg">{d.message}</span>
                        <span className="q-rule mono">{d.rule}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}

export default QualityPanel;
