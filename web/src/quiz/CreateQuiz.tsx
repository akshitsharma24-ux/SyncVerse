/** The mentor's form: five short questions (topics, difficulty, type of question, how many, how long) and the quiz is made. */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { QUIZ_LIMITS, type QuizCatalog, type QuizConfig, type QuizDifficulty, type QuizFormat, type QuizLevel, type QuizTopic } from '@syncverse/shared';
import { api } from '../api';

const LEVELS: { id: QuizLevel; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: 'Warm-up, 10 points each' },
  { id: 'medium', label: 'Medium', hint: 'Interview style, 20 points' },
  { id: 'hard', label: 'Hard', hint: 'Challenging, 30 points' },
  { id: 'mixed', label: 'Mixed', hint: 'Easy first, then harder' },
];
const FORMATS: { id: QuizFormat; label: string; hint: string }[] = [
  { id: 'mcq', label: 'Multiple choice', hint: 'Quick concept checks' },
  { id: 'code', label: 'Coding', hint: 'Solved in code, judged on tests' },
  { id: 'mixed', label: 'Both', hint: 'Concept checks and coding' },
];
const TIMES = [10, 15, 20, 30, 45, 60];

const DEFAULTS: QuizConfig = { title: '', topics: ['arrays', 'strings'], difficulty: 'mixed', format: 'mixed', count: 5, minutes: 20, liveBoard: true };

/** How many questions the bank has for this choice (before borrowing from nearby levels). */
function available(catalog: QuizCatalog | null, c: QuizConfig): number {
  if (!catalog) return 0;
  const levels: QuizDifficulty[] = c.difficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [c.difficulty];
  let n = 0;
  for (const t of catalog.topics) {
    if (!c.topics.includes(t.id)) continue;
    for (const l of levels) n += (c.format !== 'code' ? t.counts[l].mcq : 0) + (c.format !== 'mcq' ? t.counts[l].code : 0);
  }
  return n;
}

export function CreateQuiz({ onCreate, busy }: { onCreate: (config: QuizConfig) => Promise<string | null>; busy: boolean }) {
  const [catalog, setCatalog] = useState<QuizCatalog | null>(null);
  const [config, setConfig] = useState<QuizConfig>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<QuizCatalog>('/api/quiz/catalog').then(setCatalog).catch(() => setError('Could not load the topics. Check your connection.'));
  }, []);

  const set = <K extends keyof QuizConfig>(key: K, value: QuizConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));
  const toggle = (id: QuizTopic) => setConfig((c) => ({ ...c, topics: c.topics.includes(id) ? c.topics.filter((t) => t !== id) : [...c.topics, id] }));
  const matching = useMemo(() => available(catalog, config), [catalog, config]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!config.topics.length) return setError('Pick at least one topic.');
    setError(await onCreate(config));
  }

  return (
    <form className="qz-form" onSubmit={(e) => void submit(e)} data-testid="quiz-form" aria-label="Create a quiz">
      <fieldset>
        <legend><b>1</b> Which topics?</legend>
        <div className="qz-chips" role="group" aria-label="Topics">
          {(catalog?.topics ?? []).map((t) => (
            <button type="button" key={t.id} className={`qz-chip ${config.topics.includes(t.id) ? 'on' : ''}`} aria-pressed={config.topics.includes(t.id)} onClick={() => toggle(t.id)} title={t.blurb} data-testid={`quiz-topic-${t.id}`}>{t.label}</button>
          ))}
        </div>
        <div className="qz-links">
          <button type="button" onClick={() => set('topics', (catalog?.topics ?? []).map((t) => t.id))}>All topics</button>
          <button type="button" onClick={() => set('topics', [])}>Clear</button>
        </div>
      </fieldset>

      <fieldset>
        <legend><b>2</b> How hard? <small>LeetCode levels</small></legend>
        <div className="qz-seg" role="radiogroup" aria-label="Difficulty">
          {LEVELS.map((l) => (
            <button type="button" key={l.id} role="radio" aria-checked={config.difficulty === l.id} className={config.difficulty === l.id ? 'on' : ''} onClick={() => set('difficulty', l.id)} data-testid={`quiz-level-${l.id}`}>
              <b>{l.label}</b><small>{l.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend><b>3</b> What kind of questions?</legend>
        <div className="qz-seg three" role="radiogroup" aria-label="Question type">
          {FORMATS.map((f) => (
            <button type="button" key={f.id} role="radio" aria-checked={config.format === f.id} className={config.format === f.id ? 'on' : ''} onClick={() => set('format', f.id)} data-testid={`quiz-format-${f.id}`}>
              <b>{f.label}</b><small>{f.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="qz-pair">
        <fieldset>
          <legend><b>4</b> How many questions?</legend>
          <div className="qz-stepper">
            <button type="button" aria-label="Fewer questions" disabled={config.count <= QUIZ_LIMITS.minCount} onClick={() => set('count', config.count - 1)}>−</button>
            <output aria-live="polite" data-testid="quiz-count">{config.count}</output>
            <button type="button" aria-label="More questions" disabled={config.count >= QUIZ_LIMITS.maxCount} onClick={() => set('count', config.count + 1)}>+</button>
          </div>
        </fieldset>
        <fieldset>
          <legend><b>5</b> How much time?</legend>
          <div className="qz-chips tight" role="group" aria-label="Minutes">
            {TIMES.map((m) => <button type="button" key={m} className={`qz-chip ${config.minutes === m ? 'on' : ''}`} aria-pressed={config.minutes === m} onClick={() => set('minutes', m)}>{m} min</button>)}
          </div>
          <label className="qz-inline">Or type minutes <input type="number" min={QUIZ_LIMITS.minMinutes} max={QUIZ_LIMITS.maxMinutes} value={config.minutes} onChange={(e) => set('minutes', Number(e.target.value))} data-testid="quiz-minutes" /></label>
        </fieldset>
      </div>

      <div className="qz-options-row">
        <label className="qz-inline wide">Title (optional)<input type="text" maxLength={QUIZ_LIMITS.maxTitle} placeholder="DSA quiz" value={config.title} onChange={(e) => set('title', e.target.value)} data-testid="quiz-title-input" /></label>
        <label className="qz-check"><input type="checkbox" checked={config.liveBoard} onChange={(e) => set('liveBoard', e.target.checked)} data-testid="quiz-liveboard" /> Students can watch the live leaderboard</label>
      </div>

      <p className="qz-muted" data-testid="quiz-available">
        {matching === 0 ? 'No questions match that yet.' : matching < config.count ? `Only ${matching} questions match; the quiz will borrow from nearby levels.` : `${matching} questions match. ${config.count} will be picked at random.`}
      </p>
      {error && <p className="qz-error" role="alert" data-testid="quiz-form-error">{error}</p>}
      <button className="btn studio-primary" type="submit" disabled={busy || !config.topics.length} data-testid="quiz-create">{busy ? 'Creating…' : 'Create quiz'}</button>
    </form>
  );
}
