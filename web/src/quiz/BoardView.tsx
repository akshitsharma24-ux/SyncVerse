/**
 * The leaderboard as a full-window board: made to be shared on a screen in the video call. While a quiz runs it updates by itself
 * (the room's live stream); when the quiz is over it shows the final result with the top three on a podium.
 */
import { DIFFICULTY_LABEL, formatClock, type QuizView } from '@syncverse/shared';
import { useSessionUser } from '../session';
import { Icon } from '../shell/icons';
import { useQuiz } from './context';
import { Leaderboard, Podium, downloadCsv } from './Leaderboard';
import { Countdown, Overlay } from './Overlay';

export function BoardView({ view, onClose }: { view: QuizView; onClose: () => void }) {
  const me = useSessionUser();
  const { canManage } = useQuiz();
  const rows = view.leaderboard;
  const ended = view.status === 'ended';
  return (
    <Overlay
      title={view.title}
      kicker={ended ? 'Final leaderboard' : view.status === 'running' ? 'Live leaderboard' : 'Leaderboard'}
      onClose={onClose}
      testId="quiz-board"
      actions={
        <>
          {!ended && <Countdown view={view} big />}
          {canManage && rows && (
            <button className="btn btn-outline btn-sm" onClick={() => downloadCsv(view)} data-testid="quiz-export"><Icon name="download" size={14} /><span>Export CSV</span></button>
          )}
        </>
      }
    >
      <div className="qz-board">
        {rows === null ? (
          <p className="qz-note">The leaderboard is hidden until the quiz ends.</p>
        ) : (
          <>
            {ended && <Podium rows={rows} />}
            <div className="qz-board-meta">
              <span>{rows.length} {rows.length === 1 ? 'student' : 'students'}</span>
              <span>{view.questions.length} questions · {view.totalPoints} points</span>
              {view.startedAt && view.endedAt && <span>Lasted {formatClock(view.endedAt - view.startedAt)}</span>}
              {view.judging > 0 && canManage && <span className="qz-judging">Judging {view.judging} {view.judging === 1 ? 'submission' : 'submissions'}…</span>}
            </div>
            <Leaderboard rows={rows} questions={view.questions} meId={me.userId} empty="Nobody has joined this quiz yet." />
            <ol className="qz-legend" aria-label="Questions">
              {view.questions.map((q, i) => (
                <li key={q.id}><strong>Q{i + 1}</strong> {q.title} <span className={`qz-level ${q.difficulty}`}>{DIFFICULTY_LABEL[q.difficulty]}</span> <span className="mono">{q.points} pts</span></li>
              ))}
            </ol>
            <p className="qz-muted">✓ solved · ◐ part of the tests passed · ✕ tried · · not tried. Ties are broken by who reached the score first.</p>
          </>
        )}
      </div>
    </Overlay>
  );
}
