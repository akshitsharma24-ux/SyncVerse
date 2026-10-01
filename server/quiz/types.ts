/**
 * Server-side quiz question shapes. These hold the answers and the hidden tests, so they never leave the server:
 * routes/quiz.ts turns them into the Public* shapes of shared/quiz.ts.
 */
import type { QuizDifficulty, QuizSample, QuizTopic } from '@syncverse/shared';

export interface McqQuestion {
  id: string;
  type: 'mcq';
  topic: QuizTopic;
  difficulty: QuizDifficulty;
  title: string;
  prompt: string;
  options: [string, string, string, string];
  /** index of the right option */
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

/** A coding problem judged on stdin / stdout. Tests are compared token by token (whitespace-insensitive). */
export interface CodeProblem {
  id: string;
  type: 'code';
  topic: QuizTopic;
  difficulty: QuizDifficulty;
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  /** shown to students; their outputs are written by hand and are an independent check on `reference` */
  samples: QuizSample[];
  /** extra test inputs (hidden); the expected outputs come from `reference`, see scripts/gen-quiz-bank.mjs */
  hidden: Array<string | (() => string)>;
  /** model solution in Python; shown to everyone after the quiz ends */
  reference: string;
}

export type QuizQuestion = McqQuestion | CodeProblem;

/** Small deterministic generators for the larger hidden tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** `n` integers in [lo, hi] */
export function ints(seed: number, n: number, lo: number, hi: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => lo + Math.floor(r() * (hi - lo + 1)));
}

/** a shuffled 0..n-1 */
export function perm(seed: number, n: number): number[] {
  const r = rng(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** a random string of `n` letters drawn from the first `k` lowercase letters */
export function letters(seed: number, n: number, k: number): string {
  const r = rng(seed);
  return Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(r() * k))).join('');
}

export const row = (a: number[]): string => a.join(' ');
