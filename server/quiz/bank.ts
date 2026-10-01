/**
 * The question bank: 48 multiple-choice questions and 40 coding problems over eight DSA topics, three difficulties each.
 * Expected outputs of the coding problems' hidden tests are generated from the model solutions (`npm run gen:quiz`, which writes
 * expected.ts), so the bank is exactly as correct as those solutions, and each problem's hand-written samples cross-check them.
 */
import {
  DIFFICULTY_POINTS,
  QUIZ_TOPICS,
  type PublicQuestion,
  type QuestionReveal,
  type QuizConfig,
  type QuizDifficulty,
  type QuizTopic,
} from '@syncverse/shared';
import { logger } from '../logger';
import { EXPECTED } from './expected';
import { MCQS } from './mcq';
import { PROBLEMS_A } from './problems-a';
import { PROBLEMS_B } from './problems-b';
import { PROBLEMS_C } from './problems-c';
import { rng, type CodeProblem, type McqQuestion, type QuizQuestion } from './types';

const log = logger('quiz-bank');

export const CODE_PROBLEMS: CodeProblem[] = [...PROBLEMS_A, ...PROBLEMS_B, ...PROBLEMS_C];

export interface JudgeTest {
  input: string;
  output: string;
  /** samples are shown to students; hidden tests never are */
  visible: boolean;
}

/** Every test of a coding problem: its samples first, then the hidden ones. Null when the expected outputs have not been generated. */
const testCache = new Map<string, JudgeTest[] | null>();
export function testsFor(problem: CodeProblem): JudgeTest[] | null {
  if (testCache.has(problem.id)) return testCache.get(problem.id) ?? null; // the larger inputs are generated once, not per request
  const expected = EXPECTED[problem.id];
  const tests =
    !expected || expected.length !== problem.hidden.length
      ? null
      : [
          ...problem.samples.map((s) => ({ input: s.input, output: s.output, visible: true })),
          ...problem.hidden.map((h, i) => ({ input: typeof h === 'function' ? h() : h, output: expected[i], visible: false })),
        ];
  testCache.set(problem.id, tests);
  return tests;
}

const usable = (p: CodeProblem): boolean => testsFor(p) !== null;

/** Problems that can be judged (a problem whose expected outputs are missing is left out, with a warning at start-up). */
export const QUESTIONS: QuizQuestion[] = [...MCQS, ...CODE_PROBLEMS.filter(usable)];
const missing = CODE_PROBLEMS.filter((p) => !usable(p));
if (missing.length) log.warn(`${missing.length} coding problems have no generated tests (run npm run gen:quiz): ${missing.map((p) => p.id).join(', ')}`);

const BY_ID = new Map(QUESTIONS.map((x) => [x.id, x]));
export const questionById = (id: string): QuizQuestion | undefined => BY_ID.get(id);

// ------------------------------------------------------------------------------------------- views
export function publicQuestion(x: QuizQuestion): PublicQuestion {
  const base = { id: x.id, topic: x.topic, difficulty: x.difficulty, points: DIFFICULTY_POINTS[x.difficulty], title: x.title };
  if (x.type === 'mcq') return { ...base, type: 'mcq', prompt: x.prompt, options: [...x.options] };
  return {
    ...base,
    type: 'code',
    statement: x.statement,
    inputFormat: x.inputFormat,
    outputFormat: x.outputFormat,
    constraints: x.constraints,
    samples: x.samples,
    testCount: testsFor(x)?.length ?? x.samples.length,
  };
}

export function revealOf(x: QuizQuestion): QuestionReveal {
  return x.type === 'mcq' ? { id: x.id, answer: x.answer, explanation: x.explanation } : { id: x.id, solution: x.reference };
}

// ------------------------------------------------------------------------------------------ catalog
export function catalog(): { id: QuizTopic; label: string; blurb: string; counts: Record<QuizDifficulty, { mcq: number; code: number }> }[] {
  return QUIZ_TOPICS.map((t) => {
    const counts = { easy: { mcq: 0, code: 0 }, medium: { mcq: 0, code: 0 }, hard: { mcq: 0, code: 0 } };
    for (const x of QUESTIONS) if (x.topic === t.id) counts[x.difficulty][x.type]++;
    return { id: t.id, label: t.label, blurb: t.blurb, counts };
  });
}

// ------------------------------------------------------------------------------------------- picking
function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ORDER: QuizDifficulty[] = ['easy', 'medium', 'hard'];

/** The difficulties wanted for each of `count` questions: one level, or a ramp from easy to hard. */
export function difficultyPlan(level: QuizConfig['difficulty'], count: number): QuizDifficulty[] {
  if (level !== 'mixed') return Array<QuizDifficulty>(count).fill(level);
  const plan: QuizDifficulty[] = [];
  for (let i = 0; i < count; i++) {
    const share = count === 1 ? 0 : i / (count - 1);
    plan.push(share < 0.4 ? 'easy' : share < 0.8 ? 'medium' : 'hard');
  }
  return plan;
}

/**
 * Choose the questions for a quiz. Matches the topics and the difficulty plan; when a (topic, level) pool runs dry it borrows from
 * the nearest level, then from the rest of the chosen topics, so the teacher always gets `count` questions when the bank has them.
 * A mixed format alternates multiple-choice and coding questions (coding last in each pair) and sorts easy to hard.
 */
export function pickQuestions(config: Pick<QuizConfig, 'topics' | 'difficulty' | 'format' | 'count'>, seed: number): QuizQuestion[] {
  const random = rng(seed);
  const topics = new Set<QuizTopic>(config.topics);
  const wantType = (x: QuizQuestion, type: 'mcq' | 'code') => x.type === type;
  const taken = new Set<string>();
  const out: QuizQuestion[] = [];

  const plan = difficultyPlan(config.difficulty, config.count);
  const types: ('mcq' | 'code')[] = plan.map((_, i) => (config.format === 'mcq' ? 'mcq' : config.format === 'code' ? 'code' : i % 2 === 0 ? 'mcq' : 'code'));

  const take = (pool: QuizQuestion[]): QuizQuestion | undefined => pool.find((x) => !taken.has(x.id));
  const shuffled = shuffle(QUESTIONS, random);

  plan.forEach((level, i) => {
    const type = types[i];
    const inTopics = shuffled.filter((x) => topics.has(x.topic) && wantType(x, type));
    const idx = ORDER.indexOf(level);
    // nearest level first: same, then one step either way, then two
    const levels = [idx, idx - 1, idx + 1, idx - 2, idx + 2].filter((k) => k >= 0 && k < 3).map((k) => ORDER[k]);
    let pick: QuizQuestion | undefined;
    for (const l of levels) {
      pick = take(inTopics.filter((x) => x.difficulty === l));
      if (pick) break;
    }
    // the other type, still inside the topics, if this type is exhausted
    pick ??= take(shuffled.filter((x) => topics.has(x.topic) && x.difficulty === level));
    pick ??= take(shuffled.filter((x) => topics.has(x.topic)));
    if (pick) {
      taken.add(pick.id);
      out.push(pick);
    }
  });

  // easy to hard, keeping multiple choice before coding at the same level
  return out.sort((a, b) => ORDER.indexOf(a.difficulty) - ORDER.indexOf(b.difficulty) || Number(a.type === 'code') - Number(b.type === 'code'));
}

/** How many questions the bank can offer for these topics (all difficulties and types). */
export function poolSize(topics: QuizTopic[], format: QuizConfig['format']): number {
  const set = new Set(topics);
  return QUESTIONS.filter((x) => set.has(x.topic) && (format === 'mixed' || x.type === format)).length;
}

export type { McqQuestion, CodeProblem, QuizQuestion };
