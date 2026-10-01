/**
 * The Quiz learning tool (side panel). A mentor creates a timed DSA quiz here, starts it, watches the live leaderboard and sees the
 * final result; students wait, open the quiz when it starts, and watch their rank. The questions themselves are answered in the
 * full-window Arena (Arena.tsx) and the big leaderboard is the BoardView (BoardView.tsx); both are opened from here.
 */
import { useState } from 'react';
import { DIFFICULTY_LABEL, QUIZ_TOPICS, formatClock, type QuizConfig, type QuizView } from '@syncverse/shared';
import { useSessionUser } from '../session';
import { Icon } from '../shell/icons';
import { useQuiz } from './context';
import { CreateQuiz } from './CreateQuiz';
import { Leaderboard, downloadCsv } from './Leaderboard';
import { Countdown } from './Overlay';

const topicLabel = (id: string) => QUIZ_TOPICS.find((t) => t.id === id)?.label ?? id;
const LEVEL_TEXT = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed (easy to hard)' } as const;
const FORMAT_TEXT = { mcq: 'Multiple choice', code: 'Coding', mixed: 'Multiple choice and coding' } as const;

export function QuizPanel() {
  const me = useSessionUser();
  const { snap, view, loading, canManage, canAnswer, act, open } = useQuiz();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(route: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const message = await act(route, body);
    setBusy(false);
    if (message) setError(message);
    return message;
  }

  async function create(config: QuizConfig) {
    const message = await run('create', config);
    if (!message) setCreating(false);
    return message;
  }

  if (loading && !snap) return <div className="qz-panel" data-testid="quiz-panel"><p className="qz-muted">Loading…</p></div>;

  const showForm = canManage && (!view || view.status === 'ended') && (creating || !view);
  const past = snap?.past ?? [];

  return (
    <div className="qz-panel" data-testid="quiz-panel" role="region" aria-label="Quiz">
      {error && <p className="qz-error" role="alert" data-testid="quiz-error">{error}</p>}

      {showForm && (
        <>
          <header className="qz-intro">
            <h3>Create a quiz</h3>
            <p>Five quick choices and your class gets a timed DSA quiz, with a live leaderboard you can share on screen.</p>
            {view && <button className="qz-back" onClick={() => setCreating(false)} data-testid="quiz-back">← Back to the last results</button>}
          </header>
          <CreateQuiz onCreate={create} busy={busy} />
        </>
      )}

      {!showForm && view && (
        <>
          <Summary view={view} />
          {canManage ? <Teacher view={view} busy={busy} run={run} open={open} onNew={() => setCreating(true)} /> : <Student view={view} canAnswer={canAnswer} me={me.userId} open={open} />}
        </>
      )}

      {!view && !canManage && (
        <div className="qz-empty" data-testid="quiz-none">
          <Icon name="trophy" size={26} />
          <h3>No quiz right now</h3>
          <p>When your teacher starts a quiz, it appears here and you will be told. Old results show below.</p>
        </div>
      )}

      {past.length > 0 && (
        <section className="qz-history" aria-label="Earlier quizzes">
          <h4>Earlier quizzes</h4>
          <ul>
            {past.map((p) => {
              const winner = p.leaderboard?.find((r) => r.score > 0);
              return (
                <li key={p.id}>
                  <div><strong>{p.title}</strong><small>{new Date(p.endedAt ?? p.createdAt).toLocaleDateString()} · {p.participants} students{winner ? ` · won by ${winner.name} (${winner.score})` : ''}</small></div>
                  <button className="btn btn-outline btn-sm" onClick={() => open({ kind: 'board', quizId: p.id })}>Results</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Summary({ view }: { view: QuizView }) {
  return (
    <header className={`qz-summary ${view.status}`} data-testid="quiz-summary" data-status={view.status}>
      <div>
        <span className={`qz-state ${view.status}`}>{view.status === 'lobby' ? 'Not started' : view.status === 'running' ? 'Live' : 'Finished'}</span>
        <h3>{view.title}</h3>
        <p>{view.config.topics.map(topicLabel).join(', ')}<br />{LEVEL_TEXT[view.config.difficulty]} · {FORMAT_TEXT[view.config.format]} · {view.questionCount} questions · {view.totalPoints} points · {view.config.minutes} min</p>
      </div>
      <Countdown view={view} big />
    </header>
  );
}

// ---------------------------------------------------------------------------------------------- mentor
function Teacher({ view, busy, run, open, onNew }: { view: QuizView; busy: boolean; run: (route: string) => Promise<string | null>; open: (s: { kind: 'arena' | 'board'; quizId: string }) => void; onNew: () => void }) {
  const [sure, setSure] = useState(false);
  const rows = view.leaderboard ?? [];
  const started = rows.filter((r) => r.attempted > 0).length;
  return (
    <>
      {view.status === 'lobby' && (
        <>
          <ol className="qz-questions" data-testid="quiz-question-list">
            {view.questions.map((q, i) => (
              <li key={q.id}>
                <span className="n">{i + 1}</span>
                <div><strong>{q.title}</strong><small>{topicLabel(q.topic)} · {q.type === 'mcq' ? 'Multiple choice' : 'Coding'}</small></div>
                <span className={`qz-level ${q.difficulty}`}>{DIFFICULTY_LABEL[q.difficulty]}</span>
                <span className="mono pts">{q.points}</span>
              </li>
            ))}
          </ol>
          <p className="qz-muted">{view.participants} {view.participants === 1 ? 'student is' : 'students are'} in the room. Students see only the number of questions until you start.</p>
          <div className="qz-actions">
            <button className="btn studio-primary" disabled={busy} onClick={() => void run('start')} data-testid="quiz-start">Start quiz</button>
            <button className="btn btn-outline" disabled={busy} onClick={() => void run('reroll')} data-testid="quiz-reroll">Pick other questions</button>
            <button className="btn btn-outline" disabled={busy} onClick={() => void run('cancel')} data-testid="quiz-cancel">Cancel</button>
          </div>
        </>
      )}

      {view.status === 'running' && (
        <>
          <p className="qz-live-line" data-testid="quiz-progress"><strong>{started}</strong> of {view.participants} students have started{view.judging > 0 ? ` · judging ${view.judging}` : ''}</p>
          <div className="qz-actions">
            <button className="btn studio-primary" onClick={() => open({ kind: 'board', quizId: view.id })} data-testid="quiz-open-board"><Icon name="trophy" size={14} /> Open live board</button>
            {!sure ? (
              <button className="btn btn-outline" onClick={() => setSure(true)} data-testid="quiz-end">End quiz now</button>
            ) : (
              <button className="btn btn-danger" disabled={busy} onClick={() => { setSure(false); void run('end'); }} data-testid="quiz-end-confirm">Yes, end it for everyone</button>
            )}
          </div>
          <h4 className="qz-h">Live leaderboard</h4>
          <Leaderboard rows={rows} questions={view.questions} compact limit={5} empty="Nobody has scored yet." />
          <Stats view={view} />
        </>
      )}

      {view.status === 'ended' && (
        <>
          <div className="qz-actions">
            <button className="btn studio-primary" onClick={() => open({ kind: 'board', quizId: view.id })} data-testid="quiz-open-board"><Icon name="trophy" size={14} /> Final leaderboard</button>
            <button className="btn btn-outline" onClick={() => downloadCsv(view)} data-testid="quiz-export"><Icon name="download" size={14} /> Export CSV</button>
            <button className="btn btn-outline" onClick={onNew} data-testid="quiz-new">New quiz</button>
          </div>
          <h4 className="qz-h">Top of the class</h4>
          <Leaderboard rows={rows} questions={view.questions} compact limit={5} empty="Nobody scored." />
          <Stats view={view} />
          {view.startedAt && view.endedAt && <p className="qz-muted">Lasted {formatClock(view.endedAt - view.startedAt)}.</p>}
        </>
      )}
    </>
  );
}

/** How each question went for the class: who solved it, who tried it. */
function Stats({ view }: { view: QuizView }) {
  if (!view.stats?.length) return null;
  return (
    <section className="qz-stats" aria-label="How each question went" data-testid="quiz-stats">
      <h4 className="qz-h">How each question went</h4>
      <ul>
        {view.stats.map((s, i) => {
          const q = view.questions.find((x) => x.id === s.id);
          const pct = view.participants ? Math.round((s.full / view.participants) * 100) : 0;
          return (
            <li key={s.id} data-testid="quiz-stat" data-full={s.full} data-attempted={s.attempted}>
              <span className="n">Q{i + 1}</span>
              <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
              <span className="mono">{s.full} solved · {s.attempted} tried</span>
              <span className="sr-only">{q?.title}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- student
function Student({ view, canAnswer, me, open }: { view: QuizView; canAnswer: boolean; me: string; open: (s: { kind: 'arena' | 'board'; quizId: string }) => void }) {
  const mine = view.mine;
  const answered = Object.keys(mine?.answers ?? {}).length;
  return (
    <>
      {view.status === 'lobby' && (
        <div className="qz-wait" data-testid="quiz-wait" role="status">
          <span className="qz-dots" aria-hidden="true"><i /><i /><i /></span>
          <strong>Waiting for your teacher to start</strong>
          <p>{view.questionCount} questions · {view.totalPoints} points · {view.config.minutes} minutes. Get ready: the questions appear the moment it starts.</p>
        </div>
      )}

      {view.status === 'running' && (
        <>
          {canAnswer ? (
            <button className="btn studio-primary qz-big" onClick={() => open({ kind: 'arena', quizId: view.id })} data-testid="quiz-open-arena">{answered ? 'Continue the quiz' : 'Start answering'}</button>
          ) : (
            <p className="qz-muted">You are watching as a viewer: you can follow the leaderboard but not answer.</p>
          )}
          {canAnswer && <p className="qz-live-line" data-testid="quiz-mine">{answered} of {view.questionCount} answered · score <strong>{mine?.score ?? 0}</strong>{mine?.rank != null ? ` · rank ${mine.rank} of ${mine.of}` : ''}</p>}
        </>
      )}

      {view.status === 'ended' && (
        <>
          <div className="qz-result-card" data-testid="quiz-final-mine">
            <small>Your result</small>
            <strong className="mono">{mine?.score ?? 0}<i>/{view.totalPoints}</i></strong>
            {mine?.rank != null && <span>Rank {mine.rank} of {mine.of}</span>}
          </div>
          <div className="qz-actions">
            <button className="btn studio-primary" onClick={() => open({ kind: 'arena', quizId: view.id })} data-testid="quiz-review">Review answers</button>
            <button className="btn btn-outline" onClick={() => open({ kind: 'board', quizId: view.id })} data-testid="quiz-open-board"><Icon name="trophy" size={14} /> Final leaderboard</button>
          </div>
        </>
      )}

      {view.leaderboard && view.status !== 'lobby' && (
        <>
          <h4 className="qz-h">{view.status === 'ended' ? 'Final leaderboard' : 'Live leaderboard'}</h4>
          <Leaderboard rows={view.leaderboard} questions={view.questions} meId={me} compact limit={5} />
          {view.status === 'running' && <button className="btn btn-outline btn-sm" onClick={() => open({ kind: 'board', quizId: view.id })} data-testid="quiz-open-board">Open full board</button>}
        </>
      )}
      {view.status === 'running' && !view.leaderboard && <p className="qz-muted">Your teacher is keeping the leaderboard hidden until the end.</p>}
    </>
  );
}

export default QuizPanel;
