/** Lane D (Miti): P-D4 mentor overview tiles. STATUS ONLY: presence, last run result, failed streak. Never code or output. */
import { useEffect, useState } from 'react';
import type { PresenceUser } from '@syncverse/shared';
import { api } from '../api';

interface Row { userId: string; name: string; runs: number; failures: number; topError: string | null; streak: number; stuck: boolean; lastRun: 'ok' | 'failed' | null; lastError: string | null; helpRequested: boolean }

export function Overview({ people, roomCode, stateOf, onRequest }: {
  people: PresenceUser[];
  roomCode: string;
  stateOf: (id: string) => string | null;
  onRequest: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let stop = false;
    const load = () => api.get<{ rows: Row[] }>('/api/progress/room?room=' + encodeURIComponent(roomCode)).then((d) => !stop && setRows(d.rows)).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [roomCode]);

  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  async function broadcast() {
    if (!text.trim()) return;
    try {
      const r = await api.post<{ sent: number }>('/api/broadcast', { roomCode, message: text });
      setSent(`Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`);
      setText('');
    } catch {
      setSent('Could not send');
    }
    setTimeout(() => setSent(''), 3000);
  }
  const students = people.filter((p) => p.role === 'student');
  return (
    <div data-testid="overview">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input className="input" style={{ flex: 1 }} maxLength={200} placeholder="Message everyone in the room" aria-label="Message to the room" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && broadcast()} data-testid="broadcast-input" />
        <button className="btn btn-sm" onClick={broadcast} disabled={!text.trim()} data-testid="broadcast-send">Send</button>
      </div>
      <div role="status" style={{ fontSize: 12, color: 'var(--muted)', minHeight: 16 }}>{sent}</div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Who may need help (status only)</div>
      {students.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No students in the room yet.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {students.map((p) => {
          const r = rows.find((x) => x.userId === p.userId);
          const st = stateOf(p.userId);
          return (
            <div key={p.userId} role="group" aria-label={`${p.name}: ${r?.stuck ? 'stuck' : 'no stuck flag'}`} data-testid={`tile-${p.name}`} data-stuck={r?.stuck ? 'true' : 'false'}
              style={{ border: `1px solid ${r?.stuck ? 'var(--ink)' : 'var(--rule-soft)'}`, borderRadius: 4, padding: 8,
                background: r?.stuck ? 'repeating-linear-gradient(135deg, rgba(21,21,21,0.08) 0 1px, transparent 1px 6px)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: p.color }} />
                <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.state}</span>
              </div>
              <div className="mono" style={{ fontSize: 11.5, margin: '6px 0' }}>
                last run: {r?.lastRun === 'ok' ? 'ok' : r?.lastRun === 'failed' ? `failed${r.lastError ? ' · ' + r.lastError : ''}` : 'none'}
                <br />failed in a row: {r?.streak ?? 0}
                {r?.stuck && <><br /><b>STUCK</b></>}
                {r?.helpRequested && <><br /><b data-testid="help-flag">ASKED FOR HELP</b></>}
              </div>
              {st ? (
                <span className="mono" style={{ fontSize: 11 }}>{st === 'active' ? 'access active' : 'waiting for answer'}</span>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => onRequest(p.userId)}>Request access</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
