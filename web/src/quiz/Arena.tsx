/**
 * The quiz, answered: a full-window view with the questions on the left, the question in the middle (multiple choice, or a
 * problem with a private code editor) and the live leaderboard on the right. What a student types here is theirs alone: this is
 * not the shared editor. After the quiz it turns into a review with the right answers and model solutions.
 */
import { useEffect, useRef, useState } from 'react';
import { DIFFICULTY_LABEL, type MyAnswer, type PublicQuestion, type QuestionReveal, type QuizCatalog, type QuizView, type TestOutcome, type Verdict } from '@syncverse/shared';
import { api, errorMessage } from '../api';
import { useSessionUser } from '../session';
import { Icon } from '../shell/icons';
import { CodeBox } from './CodeBox';
import { msLeft, useNow, useQuiz } from './context';
import { Leaderboard } from './Leaderboard';
import { Countdown, Overlay } from './Overlay';
import { Rich } from './Rich';
import { QUIZ_LANGUAGES, STARTERS, isQuizLanguage, type QuizLanguage } from './starters';

const memory = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: the answer just is not remembered across a reload */
    }
  },
};

type Cell = 'full' | 'partial' | 'wrong' | 'none';
function cellOf(q: PublicQuestion, a: MyAnswer | undefined): Cell {
  if (!a) return 'none';
  if (a.points >= q.points) return 'full';
  if (a.points > 0) return 'partial';
  return (a.attempts ?? 0) > 0 || a.correct === false ? 'wrong' : 'none';
}
const CELL_LABEL: Record<Cell, string> = { full: 'solved', partial: 'partly right', wrong: 'tried', none: 'not answered yet' };

const VERDICT_LABEL: Record<Verdict, string> = {
  passed: 'passed',
  wrong: 'wrong answer',
  runtime_error: 'runtime error',
  timeout: 'time limit exceeded',
  compile_error: 'compile error',
  service_error: 'runner problem',
};

export function Arena({ view, onClose }: { view: QuizView; onClose: () => void }) {
  const me = useSessionUser();
  const { skew, reload } = useQuiz();
  const now = useNow(500);
  const review = view.status === 'ended';
  const timeUp = view.status === 'running' && msLeft(view, now, skew) <= 0;
  const open = view.status === 'running' && !timeUp;
  const answers = view.mine?.answers ?? {};
  const [index, setIndex] = useState(() => {
    const first = view.questions.findIndex((q) => !answers[q.id]);
    return review || first < 0 ? 0 : first;
  });
  const q = view.questions[Math.min(index, view.questions.length - 1)];
  const [languages, setLanguages] = useState<string[]>(QUIZ_LANGUAGES.map((l) => l.id));
  const [language, setLanguage] = useState<QuizLanguage>(() => {
    const saved = memory.get(`sv.quiz.lang.${me.userId}`);
    return saved && isQuizLanguage(saved) ? saved : 'python';
  });

  useEffect(() => {
    api
      .get<QuizCatalog>('/api/quiz/catalog')
      .then((c) => c.languages.length && setLanguages(c.languages))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (languages.length && !languages.includes(language)) setLanguage((languages.find(isQuizLanguage) as QuizLanguage | undefined) ?? 'python');
  }, [languages, language]);

  if (!q) return null;
  const reveal = view.reveal?.find((r) => r.id === q.id);
  const answered = view.questions.filter((x) => answers[x.id]).length;

  return (
    <Overlay
      title={view.title}
      kicker={review ? 'Quiz review' : 'Quiz'}
      onClose={onClose}
      testId="quiz-arena"
      actions={
        <div className="qz-head-stats">
          <span className="qz-stat"><small>Score</small><strong className="mono" data-testid="quiz-score">{view.mine?.score ?? 0}<i>/{view.totalPoints}</i></strong></span>
          {view.mine?.rank != null && <span className="qz-stat"><small>Rank</small><strong className="mono" data-testid="quiz-rank">{view.mine.rank}<i>/{view.mine.of}</i></strong></span>}
          <Countdown view={view} big />
        </div>
      }
    >
      {timeUp && <p className="qz-banner" role="status">Time is up. Answers are closed; the final leaderboard appears in a moment.</p>}
      {review && <p className="qz-banner ok" role="status">The quiz is over. Here are the right answers.</p>}
      <div className="qz-arena">
        <nav className="qz-rail" aria-label="Questions">
          {view.questions.map((x, i) => {
            const c = cellOf(x, answers[x.id]);
            return (
              <button key={x.id} className={`qz-rail-item ${i === index ? 'current' : ''} ${c}`} onClick={() => setIndex(i)} aria-current={i === index} data-testid={`quiz-q-${i + 1}`} data-state={c}>
                <span className="n">{i + 1}</span>
                <span className="t"><b>{x.title}</b><small>{x.type === 'mcq' ? 'Multiple choice' : 'Coding'} · {DIFFICULTY_LABEL[x.difficulty]} · {x.points} pts</small></span>
                <span className="s" title={CELL_LABEL[c]} aria-label={CELL_LABEL[c]}>{c === 'full' ? '✓' : c === 'partial' ? '◐' : c === 'wrong' ? '✕' : ''}</span>
              </button>
            );
          })}
          <p className="qz-muted">{answered} of {view.questions.length} answered</p>
        </nav>

        <section className="qz-main" aria-label={`Question ${index + 1}`}>
          {q.type === 'mcq' ? (
            <McqView key={q.id} q={q} index={index} answer={answers[q.id]} reveal={reveal} open={open} onDone={reload} />
          ) : (
            <CodeView key={q.id} view={view} q={q} index={index} answer={answers[q.id]} reveal={reveal} open={open} language={language} languages={languages} onLanguage={(l) => { setLanguage(l); memory.set(`sv.quiz.lang.${me.userId}`, l); }} onDone={reload} />
          )}
          <div className="qz-pager">
            <button className="btn btn-outline btn-sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button className="btn btn-outline btn-sm" disabled={index >= view.questions.length - 1} onClick={() => setIndex(index + 1)} data-testid="quiz-next">Next</button>
          </div>
        </section>

        <aside className="qz-side" aria-label="Leaderboard">
          <h3><Icon name="trophy" size={15} /> {review ? 'Final leaderboard' : 'Leaderboard'}</h3>
          {view.leaderboard ? (
            <Leaderboard rows={view.leaderboard} questions={view.questions} meId={me.userId} compact limit={10} />
          ) : (
            <p className="qz-muted">Your teacher is keeping the board hidden until the quiz ends. You can still see your own score.</p>
          )}
        </aside>
      </div>
    </Overlay>
  );
}

// ------------------------------------------------------------------------------------------ multiple choice
function McqView({ q, index, answer, reveal, open, onDone }: { q: PublicQuestion; index: number; answer: MyAnswer | undefined; reveal: QuestionReveal | undefined; open: boolean; onDone: () => Promise<void> }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = answer !== undefined;
  const chosen = done ? answer.choice : picked;

  async function lockIn() {
    if (picked === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<{ correct: boolean; points: number }>('/api/quiz/answer', { questionId: q.id, choice: picked });
      await onDone();
    } catch (e) {
      setError(errorMessage(e, 'Could not save your answer. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qz-question" data-testid="quiz-mcq">
      <p className="qz-meta"><span>Question {index + 1}</span><span className={`qz-level ${q.difficulty}`}>{DIFFICULTY_LABEL[q.difficulty]}</span><span className="mono">{q.points} points</span></p>
      <h3>{q.title}</h3>
      {q.prompt && <Rich text={q.prompt} />}
      <div className="qz-options" role="radiogroup" aria-label="Options">
        {q.options?.map((text, i) => {
          const right = reveal?.answer === i;
          const mine = chosen === i;
          const cls = [mine ? 'chosen' : '', done && mine ? (answer.correct ? 'correct' : 'incorrect') : '', right ? 'right' : ''].join(' ');
          return (
            <button key={i} role="radio" aria-checked={mine} className={`qz-option ${cls}`} disabled={done || !open || busy} onClick={() => setPicked(i)} data-testid={`quiz-option-${i}`}>
              <span className="k">{String.fromCharCode(65 + i)}</span>
              <span className="v">{text}</span>
              {right && <span className="m" aria-label="right answer">✓ right answer</span>}
              {done && mine && !right && <span className="m">{answer.correct ? '✓ correct' : '✕ not this one'}</span>}
            </button>
          );
        })}
      </div>
      {!done && open && (
        <div className="qz-actions">
          <button className="btn studio-primary" disabled={picked === null || busy} onClick={() => void lockIn()} data-testid="quiz-lock">{busy ? 'Saving…' : 'Lock in answer'}</button>
          <span className="qz-muted">You get one try. The right answer is shown when the quiz ends.</span>
        </div>
      )}
      {error && <p className="qz-error" role="alert">{error}</p>}
      {done && (
        <p className={`qz-verdict ${answer.correct ? 'ok' : 'no'}`} role="status" data-testid="quiz-feedback">
          {answer.correct ? `Correct! +${answer.points} points.` : 'Not this time. No points for this one.'}
        </p>
      )}
      {!done && !open && <p className="qz-verdict no" role="status">You did not answer this one in time.</p>}
      {reveal?.explanation && <div className="qz-explain"><strong>Why</strong><Rich text={reveal.explanation} /></div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- coding
type Run = { status: string; stdout: string; stderr: string; compileOutput: string; timeMs?: number };

function CodeView({
  view,
  q,
  index,
  answer,
  reveal,
  open,
  language,
  languages,
  onLanguage,
  onDone,
}: {
  view: QuizView;
  q: PublicQuestion;
  index: number;
  answer: MyAnswer | undefined;
  reveal: QuestionReveal | undefined;
  open: boolean;
  language: QuizLanguage;
  languages: string[];
  onLanguage: (l: QuizLanguage) => void;
  onDone: () => Promise<void>;
}) {
  const me = useSessionUser();
  const storageKey = (l: string) => `sv.quiz.code.${view.id}.${me.userId}.${q.id}.${l}`;
  const [code, setCode] = useState(() => memory.get(storageKey(language)) ?? STARTERS[language]);
  const [stdin, setStdin] = useState(q.samples?.[0]?.input ?? '');
  const [pane, setPane] = useState<'run' | 'result'>('result');
  const [run, setRun] = useState<Run | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [judging, setJudging] = useState(false);
  const [fresh, setFresh] = useState<NonNullable<MyAnswer['last']> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  // A different language is a different program: load what was last written for it, or the starter.
  const changeLanguage = (l: QuizLanguage) => {
    memory.set(storageKey(language), codeRef.current);
    onLanguage(l);
    setCode(memory.get(storageKey(l)) ?? STARTERS[l]);
  };
  const edit = (v: string) => {
    setCode(v);
    memory.set(storageKey(language), v);
  };

  const last = fresh ?? answer?.last ?? null;
  const total = q.testCount ?? last?.total ?? 0;

  async function tryRun() {
    if (runBusy || !open) return;
    setRunBusy(true);
    setError(null);
    setPane('run');
    try {
      setRun(await api.post<Run>('/api/quiz/run', { language, source: codeRef.current, stdin }));
    } catch (e) {
      setError(errorMessage(e, 'The code runner is not answering. Try again.'));
    } finally {
      setRunBusy(false);
    }
  }

  async function submit() {
    if (judging || !open) return;
    setJudging(true);
    setError(null);
    setPane('result');
    try {
      const r = await api.post<{ answer: MyAnswer }>('/api/quiz/submit', { questionId: q.id, language, source: codeRef.current });
      setFresh(r.answer?.last ?? null);
      await onDone();
    } catch (e) {
      setError(errorMessage(e, 'Judging failed. Nothing was counted: try again.'));
    } finally {
      setJudging(false);
    }
  }

  const available = QUIZ_LANGUAGES.filter((l) => languages.includes(l.id));
  const best = answer?.points ?? 0;

  return (
    <div className="qz-question code" data-testid="quiz-code-question">
      <div className="qz-statement">
        <p className="qz-meta"><span>Question {index + 1}</span><span className={`qz-level ${q.difficulty}`}>{DIFFICULTY_LABEL[q.difficulty]}</span><span className="mono">{q.points} points</span></p>
        <h3>{q.title}</h3>
        {q.statement && <Rich text={q.statement} />}
        <dl className="qz-spec">
          {q.inputFormat && <><dt>Input</dt><dd>{q.inputFormat}</dd></>}
          {q.outputFormat && <><dt>Output</dt><dd>{q.outputFormat}</dd></>}
          {q.constraints && <><dt>Limits</dt><dd>{q.constraints}</dd></>}
        </dl>
        {q.samples?.map((s, i) => (
          <div className="qz-sample" key={i}>
            <div><small>Sample {i + 1} input</small><pre>{s.input}</pre></div>
            <div><small>Output</small><pre>{s.output}</pre></div>
            {open && <button className="btn btn-outline btn-sm" onClick={() => { setStdin(s.input); setPane('run'); }}>Use as test input</button>}
          </div>
        ))}
        <p className="qz-muted">Your program reads the input from standard input and prints the answer. {total} tests judge a submission; your best result counts.</p>
        {reveal?.solution && (
          <details className="qz-solution" open>
            <summary>Model solution (Python)</summary>
            <pre><code>{reveal.solution}</code></pre>
          </details>
        )}
      </div>

      <div className="qz-workbench">
        <div className="qz-bar">
          <label className="qz-select"><span>Language</span>
            <select value={language} onChange={(e) => changeLanguage(e.target.value as QuizLanguage)} disabled={!open} data-testid="quiz-language">
              {available.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <span className="qz-best mono" title="Your best result for this question">Best: {best}/{q.points} pts</span>
          <div className="qz-bar-actions">
            <button className="btn btn-outline btn-sm" onClick={() => void tryRun()} disabled={!open || runBusy} data-testid="quiz-run">{runBusy ? 'Running…' : 'Run'} <kbd>Ctrl</kbd>+<kbd>Enter</kbd></button>
            <button className="btn studio-primary btn-sm" onClick={() => void submit()} disabled={!open || judging} data-testid="quiz-submit">{judging ? 'Judging…' : 'Submit'}</button>
          </div>
        </div>
        <CodeBox key={`${q.id}-${language}`} value={code} language={QUIZ_LANGUAGES.find((l) => l.id === language)?.monaco ?? 'python'} onChange={edit} readOnly={!open} label={`Your ${language} answer to ${q.title}`} onRun={() => void tryRun()} />

        <div className="qz-out">
          <div className="qz-tabs" role="tablist" aria-label="Output">
            <button role="tab" aria-selected={pane === 'run'} onClick={() => setPane('run')}>Run output</button>
            <button role="tab" aria-selected={pane === 'result'} onClick={() => setPane('result')} data-testid="quiz-result-tab">Submission{last ? ` · ${last.passed}/${last.total}` : ''}</button>
          </div>
          {error && <p className="qz-error" role="alert" data-testid="quiz-error">{error}</p>}
          {pane === 'run' ? (
            <div className="qz-run">
              <label>Input<textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={3} spellCheck={false} data-testid="quiz-stdin" /></label>
              {run ? (
                <div data-testid="quiz-run-output">
                  <small className="mono">{run.status.replace('_', ' ')}{run.timeMs !== undefined ? ` · ${run.timeMs} ms` : ''}</small>
                  <pre>{run.compileOutput || run.stderr ? `${run.compileOutput}${run.stderr}` : ''}{run.stdout}</pre>
                </div>
              ) : <p className="qz-muted">Run your program on the input above. Runs do not count.</p>}
            </div>
          ) : (
            <SubmissionResult last={last} samples={q.samples?.length ?? 0} judging={judging} points={q.points} best={best} />
          )}
        </div>
      </div>
    </div>
  );
}

function SubmissionResult({ last, samples, judging, points, best }: { last: NonNullable<MyAnswer['last']> | null; samples: number; judging: boolean; points: number; best: number }) {
  if (judging) return <p className="qz-muted" role="status">Judging your program on every test…</p>;
  if (!last) return <p className="qz-muted">Submit to run your program on all the tests. Your best submission counts.</p>;
  const failing = last.outcomes.filter((o) => o.verdict !== 'passed' && o.expected !== undefined);
  const allPassed = last.passed === last.total;
  return (
    <div className="qz-result" data-testid="quiz-result" data-passed={last.passed} data-total={last.total}>
      <p className={`qz-verdict ${allPassed ? 'ok' : 'no'}`} role="status">
        {allPassed ? `All ${last.total} tests passed.` : `${last.passed} of ${last.total} tests passed.`} Best so far: {best} of {points} points.
      </p>
      <ol className="qz-tests" aria-label="Test results">
        {last.outcomes.map((o: TestOutcome) => (
          <li key={o.index} className={o.verdict} title={`${o.index < samples ? `Sample ${o.index + 1}` : `Hidden test ${o.index - samples + 1}`}: ${VERDICT_LABEL[o.verdict]}`}>
            <span>{o.index < samples ? `S${o.index + 1}` : o.index - samples + 1}</span>
            <i aria-hidden="true">{o.verdict === 'passed' ? '✓' : '✕'}</i>
            <span className="sr-only">{VERDICT_LABEL[o.verdict]}</span>
          </li>
        ))}
      </ol>
      {last.message && <pre className="qz-message">{last.message}</pre>}
      {failing.slice(0, 1).map((o) => (
        <div className="qz-fail" key={o.index}>
          <p><strong>Sample {o.index + 1}: {VERDICT_LABEL[o.verdict]}</strong></p>
          <div className="qz-sample">
            <div><small>Input</small><pre>{o.input}</pre></div>
            <div><small>Expected</small><pre>{o.expected}</pre></div>
            <div><small>Your output</small><pre>{o.got || '(nothing)'}</pre></div>
          </div>
        </div>
      ))}
      {!allPassed && last.outcomes.some((o) => o.index >= samples && o.verdict !== 'passed') && <p className="qz-muted">Some hidden tests failed. Hidden tests are not shown: think about edge cases like the smallest and the largest input.</p>}
    </div>
  );
}

