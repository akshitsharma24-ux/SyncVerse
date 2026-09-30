/**
 * Lane D: the "assist" half of permission-gated debugging.
 *  - AssistTools (helper side): re-run the student's last program in the HELPER's own run (the result is private to the
 *    helper), and suggest an edit.
 *  - ProposalDialog (owner side): a suggested edit is shown as a diff; nothing changes unless the owner accepts, and the
 *    owner's own editor applies it (one shared-document replace, like every other accepted change).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RunResult } from '@syncverse/shared';
import { ApiError, api } from '../api';
import { useEditor, useSessionUser } from '../session';
import { changed, collapseDiff, lineDiff } from './diff';

export interface Proposal {
  id: string;
  grantId: string;
  by: string;
  note: string;
  base: string;
  source: string;
  createdAt: number;
}
export interface ProposalResult {
  id: string;
  accepted: boolean;
  by: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function message(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { error?: unknown } | null;
    if (b && typeof b === 'object' && typeof b.error === 'string') return b.error;
  }
  return 'That did not work. Try again.';
}

const STATUS_LABEL: Record<string, string> = {
  success: 'finished without errors',
  compile_error: 'compile error',
  runtime_error: 'runtime error',
  timeout: 'timed out',
  memory_limit: 'ran out of memory',
  service_error: 'the code runner had a problem',
};

/** Helper side: shown under the read-only mirror when the grant has assist scope. */
export function AssistTools({ grantId, run, result }: { grantId: string; run: RunResult | null; result: ProposalResult | null }) {
  const me = useSessionUser();
  const editor = useEditor();
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // ---- re-run ------------------------------------------------------------------------------------------------------
  const [rerun, setRerun] = useState<{ busy: boolean; run?: RunResult; error?: string }>({ busy: false });
  async function doRerun() {
    if (!run) return;
    setRerun({ busy: true });
    try {
      const { id } = await api.post<{ id: string }>('/api/run', { roomCode: me.roomCode, language: run.language, source: run.source, stdin: run.stdin });
      for (let i = 0; i < 100 && alive.current; i++) {
        await sleep(450);
        const r = await api.get<RunResult>('/api/run/' + id);
        if (r.status !== 'queued' && r.status !== 'running') {
          if (alive.current) setRerun({ busy: false, run: r });
          return;
        }
      }
      if (alive.current) setRerun({ busy: false, error: 'The re-run is taking too long.' });
    } catch (e) {
      if (alive.current) setRerun({ busy: false, error: message(e) });
    }
  }

  // ---- suggest an edit ---------------------------------------------------------------------------------------------
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [base, setBase] = useState('');
  const [note, setNote] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  /** Start (or start over) from the shared file: it is the same text both people see right now. */
  function startFromShared() {
    const current = editor.getValue();
    setBase(current);
    setText(current);
    setNote('');
    setSendErr(null);
  }
  function openEditor() {
    startFromShared();
    setSentId(null);
    setOpen(true);
  }
  async function send() {
    setSending(true);
    setSendErr(null);
    try {
      const r = await api.post<{ id: string }>(`/api/debug/${grantId}/proposal`, { source: text, base, note });
      if (alive.current) setSentId(r.id);
    } catch (e) {
      if (alive.current) setSendErr(message(e));
    } finally {
      if (alive.current) setSending(false);
    }
  }
  const answered = sentId !== null && result?.id === sentId ? result : null;
  const waiting = sentId !== null && !answered;
  // Once the owner has answered (accepted: the file changed; declined: they may have kept editing), the next suggestion
  // must start from the file as it is now, otherwise it would be stale on arrival.
  useEffect(() => {
    if (answered) startFromShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered?.id]);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--rule-soft)', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="assist-tools">
      <div className="eyebrow">Assist</div>

      <div>
        <button className="btn btn-outline btn-sm" disabled={!run || rerun.busy} onClick={doRerun} data-testid="rerun-btn" title="Runs their last program with their input in your own console. Only you see the result.">
          {rerun.busy ? 'Re-running…' : 'Re-run their code'}
        </button>
        {rerun.error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{rerun.error}</div>}
        {rerun.run && (
          <div data-testid="rerun-result" style={{ marginTop: 6, border: '1px solid var(--rule-soft)', borderRadius: 3, padding: 8 }}>
            <div className="mono" style={{ fontSize: 12 }}>
              Your re-run: {STATUS_LABEL[rerun.run.status] ?? rerun.run.status}
              {rerun.run.errorLine ? ` · line ${rerun.run.errorLine}` : ''} <span style={{ color: 'var(--muted)' }}>· only you can see this</span>
            </div>
            {rerun.run.errorMessage && <div className="mono" style={{ fontSize: 12, color: 'var(--danger)' }}>{rerun.run.errorMessage}</div>}
            {rerun.run.stdout && <pre className="mono" style={{ margin: '4px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{rerun.run.stdout}</pre>}
          </div>
        )}
      </div>

      <div>
        {!open && (
          <button className="btn btn-outline btn-sm" onClick={openEditor} data-testid="suggest-open" title="Write a change to the shared file. They see it as a diff and choose to accept or reject it.">
            Suggest an edit
          </button>
        )}
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="suggest-form">
            <label className="eyebrow" htmlFor="suggest-text">Your version of the file</label>
            <textarea id="suggest-text" className="input code" style={{ height: 150, padding: 8, resize: 'vertical', fontSize: 12 }} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} data-testid="suggest-text" maxLength={30000} />
            <input className="input" aria-label="Short note for the student (optional)" placeholder="Short note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} data-testid="suggest-note" />
            {sendErr && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{sendErr}</div>}
            {waiting && <div role="status" data-testid="suggest-waiting" style={{ fontSize: 12, color: 'var(--muted)' }}>Sent. Waiting for their answer…</div>}
            {answered && (
              <div role="status" data-testid="suggest-result" style={{ fontSize: 12.5, border: '1px solid var(--ink)', borderRadius: 3, padding: 6 }}>
                {answered.by} {answered.accepted ? 'accepted your suggestion. The shared file now has your version.' : 'declined your suggestion. Their file is unchanged.'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm" disabled={sending || waiting || !text.trim() || !changed(text, base)} onClick={send} data-testid="suggest-send">
                {sending ? 'Sending…' : answered ? 'Send a new suggestion' : 'Send suggestion'}
              </button>
              <button className="btn btn-outline btn-sm" disabled={sending} onClick={startFromShared} data-testid="suggest-reload" title="Discard your changes and start again from the file as it is now">Start over from the current file</button>
              <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)} data-testid="suggest-close">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Owner side: the diff of a suggested edit with Accept / Reject. Rendered through a portal (inactive dock tabs are hidden). */
export function ProposalDialog({ proposal, onDecided }: { proposal: Proposal; onDecided: (id: string) => void }) {
  const editor = useEditor();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 700); // re-check whether the file changed under the suggestion
    return () => clearInterval(t);
  }, []);
  const current = editor.getValue();
  const stale = changed(current, proposal.base);
  const diff = useMemo(() => collapseDiff(lineDiff(current, proposal.source), 2), [current, proposal.source]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(accepted: boolean) {
    if (accepted && changed(editor.getValue(), proposal.base)) {
      setErr('The file changed after this was suggested. Reject it and ask for a new suggestion.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/debug/${proposal.grantId}/proposal/${proposal.id}/decision`, { accepted });
      if (accepted) editor.replaceAll(proposal.source); // one shared-document change, made by the owner's own editor
      onDecided(proposal.id);
    } catch (e) {
      setErr(message(e));
      setBusy(false);
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Suggested edit" data-testid="proposal-modal" style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 61 }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--ink)', borderRadius: 4, padding: 18, width: 'min(680px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow">Suggested edit</div>
        <p style={{ margin: 0, fontSize: 14 }}>
          <b>{proposal.by}</b> suggests a change to your code.
          {proposal.note && <> Note: “{proposal.note}”.</>} Nothing changes unless you accept.
        </p>
        <div role="group" aria-label="Changes if you accept" data-testid="proposal-diff" className="mono" style={{ overflow: 'auto', maxHeight: '46vh', border: '1px solid var(--rule-soft)', borderRadius: 3, fontSize: 12, padding: '4px 0' }}>
          {diff.map((d, i) =>
            d.kind === 'skip' ? (
              <div key={i} style={{ padding: '0 8px', color: 'var(--muted)' }}>… {d.count} unchanged line{d.count === 1 ? '' : 's'} …</div>
            ) : (
              <div
                key={i}
                data-kind={d.kind}
                style={{
                  whiteSpace: 'pre',
                  padding: '0 8px',
                  color: d.kind === 'add' ? 'var(--ok)' : d.kind === 'del' ? 'var(--muted)' : 'inherit',
                  textDecoration: d.kind === 'del' ? 'line-through' : 'none',
                  background: d.kind === 'add' ? 'rgba(46, 125, 87, 0.09)' : d.kind === 'del' ? 'repeating-linear-gradient(135deg, var(--hatch-mid) 0 1px, transparent 1px 6px)' : 'transparent',
                }}
              >
                {d.kind === 'add' ? '+ ' : d.kind === 'del' ? '- ' : '  '}
                {d.text}
              </div>
            ),
          )}
        </div>
        {stale && (
          <div role="alert" data-testid="proposal-stale" style={{ fontSize: 12.5, border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 3, padding: 6 }}>
            The file has changed since this was suggested. Reject it and ask for a new suggestion.
          </div>
        )}
        {err && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy || stale} onClick={() => decide(true)} data-testid="proposal-accept">Accept</button>
          <button className="btn btn-outline" autoFocus disabled={busy} onClick={() => decide(false)} data-testid="proposal-reject">Reject</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
