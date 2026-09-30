/**
 * Lane B (Simrit): P-B2 console panel. Run (button or Ctrl+Enter), stdin, stdout / errors tabs, status badge with time and
 * memory, last five runs. Only the person who runs sees the result (the server enforces it; the shell shows the lock).
 * After every finished run useWorkspace().setLastRun(result) is called (see useRunner.ts) so Lane C/D can read it.
 */
import { useEffect, useRef, useState } from 'react';
import type { RunResult, RunStatus } from '@syncverse/shared';
import { useActiveFile, useEditor, useSessionUser } from '../session';
import { useRunner } from './useRunner';
import { flashLine } from './markers';
import { ALL_LANGUAGES, LANGUAGE_LABEL, setLanguage, useLanguage, type Lang } from './language';
import './console.css';

type Tone = 'ok' | 'danger' | 'warn' | 'muted' | 'ink';

const STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'ink' },
  running: { label: 'Running', tone: 'ink' },
  success: { label: 'Success', tone: 'ok' },
  compile_error: { label: 'Compile error', tone: 'danger' },
  runtime_error: { label: 'Runtime error', tone: 'danger' },
  timeout: { label: 'Timeout', tone: 'warn' },
  memory_limit: { label: 'Memory limit', tone: 'warn' },
  service_error: { label: 'Service error', tone: 'muted' },
};

const fmtTime = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const fmtMem = (kb: number) => `${Math.max(1, Math.round(kb / 1024))} MB`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

function stdinKey(room: string) {
  return `sv.stdin.${room}`;
}

export function RunPanel() {
  const editor = useEditor();
  const me = useSessionUser();
  const { runs, selectedId, setSelectedId, busy, notice, info, run } = useRunner();
  const [stdin, setStdin] = useState(() => {
    try {
      return sessionStorage.getItem(stdinKey(me.roomCode)) ?? '';
    } catch {
      return '';
    }
  });
  const [tab, setTab] = useState<'out' | 'err'>('out');
  const [elapsed, setElapsed] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Only offer what this server can run (Judge0: five languages; the local demo runner: Python and JavaScript).
  const chosen = useLanguage();
  const available: Lang[] = info ? ALL_LANGUAGES.filter((l) => info.languages.includes(l)) : ['python'];
  const language: Lang = available.includes(chosen) ? chosen : 'python';
  useEffect(() => {
    if (info && chosen !== language) setLanguage(language); // the saved choice is not available here: go back to Python
  }, [info, chosen, language]);
  // Switching to another file (or changing the open file's language) selects that language to run. The first look keeps the saved choice.
  const file = useActiveFile();
  const seenFile = useRef<boolean>(false);
  useEffect(() => {
    if (!file) return;
    if (seenFile.current && (ALL_LANGUAGES as string[]).includes(file.language)) setLanguage(file.language as Lang);
    seenFile.current = true;
  }, [file?.id, file?.language]); // eslint-disable-line react-hooks/exhaustive-deps
  const runRef = useRef(() => {});
  runRef.current = () => void run(stdin, language);

  const viewed: RunResult | undefined = runs.find((r) => r.id === selectedId) ?? runs[0];
  const errText = viewed ? [viewed.compileOutput, viewed.stderr].filter(Boolean).join('\n') : '';

  useEffect(() => {
    try {
      sessionStorage.setItem(stdinKey(me.roomCode), stdin);
    } catch {
      /* ignore */
    }
  }, [stdin, me.roomCode]);

  // Show the errors tab when a run failed and printed nothing useful; otherwise the output.
  useEffect(() => {
    if (!viewed) return;
    setTab(viewed.status !== 'success' && (viewed.stderr || viewed.compileOutput) ? 'err' : 'out');
  }, [viewed?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  // Ctrl+Enter / Cmd+Enter runs. Monaco would insert a line, so listen first (capture) and only inside the editor,
  // this panel, or with nothing focused; other panels' inputs keep their own shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const ok = !t || t === document.body || !!t.closest('.monaco-editor') || !!root.current?.contains(t);
      if (!ok) return;
      e.preventDefault();
      e.stopPropagation();
      runRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const badge = busy ? STATUS.running : viewed ? STATUS[viewed.status] : null;
  const failed = !!viewed && !busy && viewed.status !== 'success' && viewed.status !== 'service_error' && !!viewed.errorMessage;
  const shown = tab === 'err' ? errText : (viewed?.stdout ?? '');

  return (
    <div className="rc-root" ref={root} data-testid="run-panel">
      <div className="rc">
        <div className="rc-left">
          <div className="rc-bar">
            <button
              type="button"
              className="btn btn-sm"
              data-testid="run-btn"
              disabled={busy}
              onClick={() => runRef.current()}
              title="Run the shared file with your input (Ctrl+Enter)"
            >
              <svg width="10" height="11" viewBox="0 0 10 11" aria-hidden="true">
                <path d="M1 1l8 4.5L1 10z" fill="currentColor" />
              </svg>
              {busy ? 'Running…' : 'Run'}
            </button>
            <span className="eyebrow hide-sm">Ctrl+Enter</span>
            {available.length > 1 && (
              <select
                className="input rc-lang"
                aria-label="Language to run"
                data-testid="run-language"
                value={language}
                disabled={busy}
                onChange={(e) => setLanguage(e.target.value as Lang)}
              >
                {available.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABEL[l]}
                  </option>
                ))}
              </select>
            )}
            {badge && (
              <span
                className="rc-badge"
                data-tone={badge.tone}
                data-testid="run-status"
                data-status={busy ? 'running' : viewed?.status}
                data-run-id={viewed?.id}
                role="status"
              >
                <i />
                {badge.label}
                {busy && elapsed >= 2 ? ` ${elapsed}s` : ''}
              </span>
            )}
          </div>
          <label className="eyebrow" htmlFor="rc-stdin">
            Input (stdin)
          </label>
          <textarea
            id="rc-stdin"
            className="input code rc-stdin"
            data-testid="stdin-input"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Text your program reads, e.g. with input()"
            spellCheck={false}
            maxLength={10000}
          />
          {language !== 'python' && (
            <div className="rc-hint" data-testid="run-language-hint">
              Running as {LANGUAGE_LABEL[language]}.
              {file && file.language !== language && ` The open file ${file.name} is set to ${LANGUAGE_LABEL[file.language as Lang] ?? file.language}; change its language in the file bar to match.`}
            </div>
          )}
        </div>

        <div className="rc-right">
          <div className="rc-head">
            <div className="seg rc-seg" role="group" aria-label="Output type">
              <button type="button" aria-pressed={tab === 'out'} onClick={() => setTab('out')} data-testid="tab-stdout">
                Output
              </button>
              <button type="button" aria-pressed={tab === 'err'} onClick={() => setTab('err')} data-testid="tab-stderr">
                Errors{errText ? ' •' : ''}
              </button>
            </div>
            {viewed && !busy && (
              <span className="rc-meta" data-testid="run-meta">
                {viewed.timeMs !== undefined ? fmtTime(viewed.timeMs) : ''}
                {viewed.timeMs !== undefined && viewed.memoryKb !== undefined ? ' · ' : ''}
                {viewed.memoryKb !== undefined ? fmtMem(viewed.memoryKb) : ''}
              </span>
            )}
            {runs.length > 0 && (
              <div className="rc-history" data-testid="run-history" aria-label="Your last runs">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="rc-chip"
                    data-testid="run-history-item"
                    data-tone={STATUS[r.status].tone}
                    aria-pressed={r.id === viewed?.id}
                    title={`${LANGUAGE_LABEL[r.language as Lang] ?? r.language} · ${STATUS[r.status].label}${r.stdin ? ` · input: ${r.stdin.slice(0, 40)}` : ''}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <i />
                    {clock(r.createdAt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {info && !info.sandboxed && (
            <div className="rc-note" data-tone="warn" data-testid="run-unsandboxed">
              Demo runner on this server: code is not sandboxed.
            </div>
          )}
          {notice && (
            <div className="rc-note" data-tone="warn" role="alert" data-testid="run-notice">
              {notice}
            </div>
          )}

          {failed && viewed && (
            <div
              className="rc-err"
              data-tone={viewed.status === 'timeout' || viewed.status === 'memory_limit' ? 'warn' : 'danger'}
              data-clickable={viewed.errorLine !== undefined}
              data-testid="run-error"
              onClick={() => viewed.errorLine !== undefined && flashLine(editor, viewed.errorLine, 4000)}
            >
              <span>{viewed.errorMessage}</span>
              {viewed.errorLine !== undefined && (
                <button
                  type="button"
                  data-testid="run-error-line"
                  onClick={(e) => {
                    e.stopPropagation();
                    flashLine(editor, viewed.errorLine as number, 4000);
                  }}
                >
                  line {viewed.errorLine}
                </button>
              )}
            </div>
          )}

          <pre
            className="rc-out"
            data-stale={busy && !!viewed}
            data-testid={tab === 'err' ? 'run-stderr' : 'run-stdout'}
            aria-live="polite"
            role="region"
            aria-label={tab === 'err' ? 'Error output' : 'Program output'}
            tabIndex={0}
          >
            {busy && !viewed ? (
              <span className="rc-empty">Running…</span>
            ) : !viewed ? (
              <span className="rc-empty">
                Press Run (Ctrl+Enter) to run the shared file with your own input. Only you see the result.
              </span>
            ) : shown ? (
              shown
            ) : (
              <span className="rc-empty">{tab === 'err' ? 'No errors.' : '(no output)'}</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default RunPanel;
