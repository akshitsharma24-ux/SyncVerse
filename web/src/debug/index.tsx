/**
 * Lane D (Miti): P-D1 permission-gated debug access.
 * Request / allow / deny / revoke, a read-only mirror of the owner's latest run for the grantee.
 * Modal and banner render through a portal because inactive dock tabs are display:none.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DebugGrant, RunResult } from '@syncverse/shared';
import { ApiError, api, eventSourceUrl } from '../api';
import { useSessionUser, usePresence } from '../session';
import { Icon } from '../shell/icons';
import { Overview } from './Overview';

const LIVE = (g: DebugGrant) => g.status === 'requested' || g.status === 'active';

function useGrants(roomCode: string) {
  const [grants, setGrants] = useState<Record<string, DebugGrant>>({});
  const merge = useCallback((g: DebugGrant) => setGrants((prev) => ({ ...prev, [g.id]: g })), []);

  useEffect(() => {
    let closed = false;
    api.get<DebugGrant[]>('/api/debug/grants').then((list) => {
      if (!closed) setGrants(Object.fromEntries(list.map((g) => [g.id, g])));
    }).catch(() => {});
    const es = new EventSource(eventSourceUrl('/api/debug/events?room=' + encodeURIComponent(roomCode)));
    es.onmessage = (m) => merge(JSON.parse(m.data) as DebugGrant);
    return () => {
      closed = true;
      es.close();
    };
  }, [roomCode, merge]);

  // Expiry is enforced server-side; this just refreshes the screen when the clock passes expiresAt.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  return useMemo(
    () =>
      Object.values(grants).map((g) =>
        g.status === 'active' && g.expiresAt !== undefined && g.expiresAt <= now ? { ...g, status: 'expired' as const } : g,
      ),
    [grants, now],
  );
}

function Mirror({ ownerName, ownerId }: { ownerName: string; ownerId: string }) {
  const [run, setRun] = useState<RunResult | null | 'none'>('none');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await api.get<RunResult | null>('/api/runs/latest?ownerId=' + encodeURIComponent(ownerId));
        if (!stop) {
          setRun(r);
          setErr(null);
        }
      } catch (e) {
        if (!stop) setErr(e instanceof ApiError && e.status === 501 ? 'Runs are not connected yet (Lane B).' : 'Could not read this run.');
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [ownerId]);

  return (
    <div style={{ border: '1px solid var(--ink)', borderRadius: 4, padding: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        <Icon name="lock" size={12} /> {ownerName}'s latest run · read only
      </div>
      {err && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{err}</div>}
      {!err && (run === 'none' || run === null) && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{run === null ? 'No run yet.' : 'Loading…'}</div>}
      {run && run !== 'none' && (
        <>
          <div className="mono" style={{ fontSize: 12, marginBottom: 6 }}>
            status: {run.status.replace('_', ' ')}
            {run.errorLine ? ` · line ${run.errorLine}` : ''}
          </div>
          {run.stdin && <pre className="mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>stdin: {run.stdin}</pre>}
          {run.stdout && <pre className="mono" style={{ margin: '4px 0 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>{run.stdout}</pre>}
          {(run.stderr || run.compileOutput) && (
            <pre className="mono" style={{ margin: '4px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--danger)' }}>
              {run.stderr || run.compileOutput}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

export function DebugPanel() {
  const me = useSessionUser();
  const people = usePresence().filter((p) => p.userId !== me.userId);
  const grants = useGrants(me.roomCode);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const incoming = grants.filter((g) => g.ownerId === me.userId && g.status === 'requested');
  const viewing = grants.filter((g) => g.ownerId === me.userId && g.status === 'active');
  const mine = grants.filter((g) => g.granteeId === me.userId);
  const active = mine.filter((g) => g.status === 'active');
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? 'That person';

  async function call(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof ApiError && e.status === 429 ? 'Too many requests. Try again in a few minutes.' : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  }
  const request = (ownerId: string) => call('req' + ownerId, () => api.post('/api/debug/request', { ownerId, roomCode: me.roomCode }));
  const decide = (id: string, allow: boolean) => call(id, () => api.post(`/api/debug/${id}/decision`, { allow }));
  const revoke = (id: string) => call(id, () => api.post(`/api/debug/${id}/revoke`));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="debug-panel">
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
        Your runs and debugging are private. Someone can look only if you allow it, and you can end it any time. Mentors see that you
        are stuck, not what you ran.
      </p>

      {me.role === 'mentor' && (
        <Overview
          people={people}
          roomCode={me.roomCode}
          stateOf={(id) => mine.find((x) => x.ownerId === id && LIVE(x))?.status ?? null}
          onRequest={request}
        />
      )}

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>People in this room</div>
        {people.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nobody else is here yet.</div>}
        {people.map((p) => {
          const g = mine.filter((x) => x.ownerId === p.userId && LIVE(x))[0];
          return (
            <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid var(--rule-soft)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: p.color }} />
              <span style={{ flex: 1, fontSize: 13 }}>
                {p.name} <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{p.role}</span>
              </span>
              {g ? (
                <span className="mono" style={{ fontSize: 11 }} data-testid={`grant-state-${p.userId}`}>{g.status === 'active' ? 'access active' : 'waiting for answer'}</span>
              ) : (
                <button className="btn btn-outline btn-sm" disabled={busy === 'req' + p.userId} onClick={() => request(p.userId)} data-testid={`request-${p.userId}`}>
                  Request access
                </button>
              )}
            </div>
          );
        })}
      </div>

      {msg && <div style={{ color: 'var(--danger)', fontSize: 12 }} role="alert">{msg}</div>}

      {active.map((g) => (
        <div key={g.id} data-testid="mirror">
          <Mirror ownerId={g.ownerId} ownerName={nameOf(g.ownerId)} />
          <button className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => revoke(g.id)}>Stop viewing</button>
        </div>
      ))}
      {mine.some((g) => g.status === 'denied') && <div style={{ fontSize: 12, color: 'var(--muted)' }}>A request was declined.</div>}

      {incoming.length > 0 && (
        <Overlay>
          <div role="dialog" aria-modal="true" aria-label="Debug access request" data-testid="access-modal"
            style={{ position: 'fixed', inset: 0, background: 'rgba(21,21,21,0.35)', display: 'grid', placeItems: 'center', zIndex: 60 }}>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--ink)', borderRadius: 4, padding: 18, width: 'min(380px, 92vw)' }}>
              <div className="eyebrow">Access request</div>
              <p style={{ margin: '8px 0 14px', fontSize: 14 }}>
                <b>{incoming[0].granteeName}</b> wants to see your latest run and error. They cannot edit your code. You can revoke at any time.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => decide(incoming[0].id, true)} data-testid="allow">Allow</button>
                <button className="btn btn-outline" onClick={() => decide(incoming[0].id, false)} data-testid="deny">Deny</button>
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {(viewing.length > 0 || active.length > 0) && (
        <Overlay>
          <div style={{ position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 55, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {viewing.map((g) => (
              <div key={g.id} data-testid="viewing-banner" className="mono"
                style={{ background: 'var(--ink)', color: 'var(--paper)', borderRadius: 4, padding: '8px 12px', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span>{g.granteeName} is viewing your session</span>
                <button className="btn btn-sm" style={{ background: 'var(--paper)', color: 'var(--ink)' }} onClick={() => revoke(g.id)} data-testid="revoke">Revoke</button>
              </div>
            ))}
            {active.map((g) => (
              <div key={g.id} className="mono" style={{ background: 'var(--ink)', color: 'var(--paper)', borderRadius: 4, padding: '8px 12px', fontSize: 12 }}>
                You can view {nameOf(g.ownerId)}'s session (Debug tab)
              </div>
            ))}
          </div>
        </Overlay>
      )}
    </div>
  );
}

export default DebugPanel;
