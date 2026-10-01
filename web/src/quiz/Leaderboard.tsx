/** Leaderboard pieces shared by the side panel and the full-window board: the table, the podium and the CSV export. */
import { DIFFICULTY_LABEL, formatClock, type CellState, type LeaderRow, type PublicQuestion, type QuizView } from '@syncverse/shared';

const CELL_GLYPH: Record<CellState, { glyph: string; label: string }> = {
  full: { glyph: '✓', label: 'solved' },
  partial: { glyph: '◐', label: 'partly right' },
  wrong: { glyph: '✕', label: 'tried, not right' },
  none: { glyph: '·', label: 'not tried' },
};

const initials = (name: string): string => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export function Leaderboard({
  rows,
  questions,
  meId,
  compact = false,
  limit,
  empty = 'Nobody has scored yet.',
}: {
  rows: LeaderRow[];
  questions: PublicQuestion[];
  meId?: string;
  /** name and score only: for the narrow side panel */
  compact?: boolean;
  limit?: number;
  empty?: string;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!rows.length) return <p className="qz-muted" data-testid="leaderboard-empty">{empty}</p>;
  return (
    <div className="qz-table-wrap">
      <table className={`qz-table ${compact ? 'compact' : ''}`} data-testid="leaderboard" aria-label="Leaderboard">
        <thead>
          <tr>
            <th scope="col" className="qz-rank">#</th>
            <th scope="col">Name</th>
            {!compact && questions.map((q, i) => <th scope="col" key={q.id} className="qz-cell" title={`${q.title} · ${DIFFICULTY_LABEL[q.difficulty]} · ${q.points} points`}>Q{i + 1}</th>)}
            {!compact && <th scope="col" className="qz-time">Last</th>}
            <th scope="col" className="qz-score">Score</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.userId} className={r.userId === meId ? 'me' : undefined} data-testid="leaderboard-row" data-name={r.name} data-rank={r.rank} data-score={r.score}>
              <td className={`qz-rank r${r.rank <= 3 && r.score > 0 ? r.rank : ''}`}>{r.score > 0 || r.attempted > 0 ? r.rank : '–'}</td>
              <td className="qz-name"><span className="qz-avatar" aria-hidden="true">{initials(r.name)}</span><span>{r.name}{r.userId === meId ? <em> (you)</em> : null}</span></td>
              {!compact && r.cells.map((c, i) => <td key={i} className={`qz-cell ${c.state}`} title={`${CELL_GLYPH[c.state].label}${c.points ? `: ${c.points} points` : ''}`}><span aria-hidden="true">{CELL_GLYPH[c.state].glyph}</span><span className="sr-only">{CELL_GLYPH[c.state].label}</span></td>)}
              {!compact && <td className="qz-time mono">{r.lastAt === null ? '–' : formatClock(r.lastAt)}</td>}
              <td className="qz-score mono">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && <p className="qz-muted qz-more">+ {rows.length - limit} more</p>}
    </div>
  );
}

/** The top three as a podium (2nd, 1st, 3rd). Only people with a score are shown. */
export function Podium({ rows }: { rows: LeaderRow[] }) {
  const top = rows.filter((r) => r.score > 0).slice(0, 3);
  if (!top.length) return null;
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <ol className="qz-podium" data-testid="podium" aria-label="Top three" style={{ ['--n' as string]: order.length }}>
      {order.map((r) => (
        <li key={r.userId} className={`place p${r.rank}`}>
          <span className="qz-avatar big" aria-hidden="true">{initials(r.name)}</span>
          <strong>{r.name}</strong>
          <span className="mono">{r.score} pts</span>
          <span className="step" aria-hidden="true">{r.rank}</span>
        </li>
      ))}
    </ol>
  );
}

/** Download the leaderboard as a spreadsheet-friendly CSV. */
export function downloadCsv(view: QuizView): void {
  const rows = view.leaderboard ?? [];
  const head = ['Rank', 'Name', 'Score', 'Solved', 'Attempted', 'Last improved', ...view.questions.map((q, i) => `Q${i + 1} ${q.title}`)];
  const cell = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [head, ...rows.map((r) => [r.rank, r.name, r.score, r.solved, r.attempted, r.lastAt === null ? '' : formatClock(r.lastAt), ...r.cells.map((c) => `${c.state} ${c.points}`)])];
  const csv = lines.map((l) => l.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${view.title.replace(/[^\w.-]+/g, '_') || 'quiz'}-leaderboard.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
