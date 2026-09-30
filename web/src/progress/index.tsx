/** Lane D (Miti): P-D2 progress page. Observations, not scores: no grades, ranks or leaderboards. */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSessionUser } from '../session';

interface Summary {
  runs: number;
  successes: number;
  failures: number;
  successRatePct: number | null;
  errorCategories: { label: string; count: number }[];
  aiExplains: number;
  concepts: string[];
  conceptDefs: { name: string; definition: string }[];
  suggestions: string[];
  trend: { label: string; pct: number }[];
  observations: string[];
  recent: { at: number; ok: boolean; label?: string }[];
}
interface Row { userId: string; name: string; runs: number; failures: number; topError: string | null; streak: number; stuck: boolean }

function usePoll<T>(path: string | null, ms = 4000): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    let stop = false;
    const load = () => api.get<T>(path).then((d) => !stop && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, ms);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [path, ms]);
  return data;
}

export function ProgressPanel() {
  const me = useSessionUser();
  const room = encodeURIComponent(me.roomCode);
  const s = usePoll<Summary>(`/api/progress/me?room=${room}`);
  const table = usePoll<{ rows: Row[] }>(me.role === 'mentor' ? `/api/progress/room?room=${room}` : null);
  const trends = usePoll<{ students: number; trends: { concept: string; struggling: number; total: number }[] }>(me.role === 'mentor' ? `/api/progress/trends?room=${room}` : null);
  const maxCat = Math.max(1, ...(s?.errorCategories.map((c) => c.count) ?? [1]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="progress-panel" role="region" aria-label="Learning progress">
      {!s && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</div>}
      {s && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[['Runs', s.runs], ['Succeeded', s.successes], ['AI explains', s.aiExplains]].map(([k, v]) => (
              <div key={k} style={{ border: '1px solid var(--rule-soft)', borderRadius: 4, padding: '8px 10px' }}>
                <div className="eyebrow">{k}</div>
                <div className="mono" style={{ fontSize: 20 }}>{v}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>What we noticed</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="observations">
              {s.observations.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Recent runs (oldest to newest)</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {s.recent.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>none yet</span>}
              {s.recent.map((r, i) => (
                <span key={i} className="mono" style={{ fontSize: 11, border: '1px solid var(--ink)', borderRadius: 3, padding: '1px 6px', background: r.ok ? 'transparent' : 'repeating-linear-gradient(135deg, rgba(21,21,21,0.12) 0 1px, transparent 1px 5px)' }}>
                  {r.ok ? 'ok' : r.label ?? 'error'}
                </span>
              ))}
            </div>
          </div>

          {s.errorCategories.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Error categories</div>
              {s.errorCategories.map((c) => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 3 }}>
                  <span className="mono" style={{ width: 110 }}>{c.label}</span>
                  <span style={{ height: 8, width: `${(c.count / maxCat) * 100}%`, maxWidth: '55%', background: 'var(--ink)', borderRadius: 2 }} />
                  <span className="mono">{c.count}</span>
                </div>
              ))}
            </div>
          )}

          {s.trend.length > 1 && (
            <div data-testid="trend">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Success over time (blocks of 5 runs)</div>
              {s.trend.map((t) => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 3 }}>
                  <span className="mono" style={{ width: 90 }}>{t.label}</span>
                  <span style={{ height: 8, width: `${t.pct * 0.5}%`, minWidth: 2, background: 'var(--ink)', borderRadius: 2 }} />
                  <span className="mono">{t.pct}% ok</span>
                </div>
              ))}
            </div>
          )}

          {s.conceptDefs.length > 0 && (
            <div data-testid="concepts">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Concepts touched</div>
              <dl style={{ margin: 0, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.conceptDefs.map((c) => (
                  <div key={c.name}><dt style={{ display: 'inline', fontWeight: 600 }}>{c.name}: </dt><dd style={{ display: 'inline', margin: 0, color: 'var(--muted)' }}>{c.definition}</dd></div>
                ))}
              </dl>
            </div>
          )}

          {s.suggestions.length > 0 && (
            <div data-testid="suggestions">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Try next</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.suggestions.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      {me.role === 'mentor' && (
        <div data-testid="mentor-table">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Class overview (status only)</div>
          <table aria-label="Class overview" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr className="mono" style={{ textAlign: 'left', color: 'var(--muted)' }}><th scope="col">Student</th><th scope="col">Runs</th><th scope="col">Failed</th><th scope="col">Top error</th><th scope="col">Flags</th></tr>
            </thead>
            <tbody>
              {(table?.rows ?? []).map((r) => (
                <tr key={r.userId} style={{ borderTop: '1px solid var(--rule-soft)' }}>
                  <td>{r.name}</td><td className="mono">{r.runs}</td><td className="mono">{r.failures}</td>
                  <td className="mono">{r.topError ?? '-'}</td>
                  <td>{r.stuck ? <span className="mono" style={{ border: '1px solid var(--ink)', padding: '0 4px' }}>stuck</span> : null}</td>
                </tr>
              ))}
              {(table?.rows.length ?? 0) === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', padding: '6px 0' }}>No student activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {me.role === 'mentor' && (
        <div data-testid="trends">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Class trends (counts, no names)</div>
          {(trends?.trends ?? []).map((t) => (
            <div key={t.concept} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 3 }}>
              <span style={{ width: 120 }}>{t.concept}</span>
              <span style={{ height: 8, width: `${(t.struggling / Math.max(1, t.total)) * 50}%`, background: 'var(--ink)', borderRadius: 2 }} />
              <span className="mono">{t.struggling} of {t.total} students ({Math.round((t.struggling / Math.max(1, t.total)) * 100)}%)</span>
            </div>
          ))}
          {(trends?.trends.length ?? 0) === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No shared struggles yet.</div>}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>
        What we record: whether a run worked, its error type, and when you asked for AI help. Never your code, keystrokes or cursor.
        These are observations, not grades.
      </p>
    </div>
  );
}

export default ProgressPanel;
