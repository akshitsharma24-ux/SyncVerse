/**
 * Judges a coding answer: runs the student's program on every test of the problem through the same runner as the Run button
 * (Judge0, or the local fallback) and compares the output token by token. Hidden tests are never described beyond pass / fail.
 */
import type { QuizSample, TestOutcome, Verdict } from '@syncverse/shared';
import { ServiceError, runOnce, type RunLanguage } from '../routes/run';
import { testsFor, type JudgeTest } from './bank';
import type { CodeProblem } from './types';

export interface JudgeResult {
  passed: number;
  total: number;
  outcomes: TestOutcome[];
  /** a compile error, or the first runtime error, in the student's own words from the compiler / runtime */
  message?: string;
}

const MAX_PARALLEL = Number(process.env.QUIZ_JUDGE_PARALLEL ?? 3);
const CLIP = 400;

const tokens = (s: string): string[] => s.replace(/\r\n/g, '\n').split(/\s+/).filter(Boolean);
export const sameOutput = (got: string, want: string): boolean => {
  const a = tokens(got);
  const b = tokens(want);
  return a.length === b.length && a.every((t, i) => t === b[i]);
};
const clip = (s: string): string => (s.length > CLIP ? s.slice(0, CLIP) + ' ...' : s);

// A tiny gate so thirty students submitting at once do not flood the code runner.
let running = 0;
const waiting: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

type Ran = { verdict: Verdict; got?: string; message?: string };

async function runTest(language: RunLanguage, source: string, test: JudgeTest): Promise<Ran> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await slot(() => runOnce(language, source, test.input));
      if (out.status === 'compile_error') return { verdict: 'compile_error', message: clip((out.compileOutput || out.stderr).trim()) };
      if (out.status === 'timeout') return { verdict: 'timeout', message: 'Time limit exceeded (5 s).' };
      if (out.status === 'memory_limit') return { verdict: 'runtime_error', message: 'Memory limit exceeded.' };
      if (out.status === 'runtime_error') return { verdict: 'runtime_error', message: clip(lastLine(out.stderr)) };
      return { verdict: sameOutput(out.stdout, test.output) ? 'passed' : 'wrong', got: clip(out.stdout.trim()) };
    } catch (e) {
      lastError = e;
      if (!(e instanceof ServiceError)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new ServiceError('The code runner failed.');
}

/** The most useful line of an error: the last non-empty one (the exception line in Python, Java and Node). */
function lastLine(stderr: string): string {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  const named = [...lines].reverse().find((l) => /(Error|Exception)\b/.test(l));
  return named ?? lines[lines.length - 1] ?? 'The program crashed.';
}

/**
 * Throws ServiceError when the runner itself is unavailable, so the caller can tell the student to try again without counting an attempt.
 */
export async function judge(problem: CodeProblem, language: RunLanguage, source: string): Promise<JudgeResult> {
  const tests = testsFor(problem);
  if (!tests) throw new ServiceError('This problem has no tests yet.');
  const outcomes: TestOutcome[] = new Array(tests.length);
  const notes: (string | undefined)[] = new Array(tests.length);
  const done = (i: number, r: Ran): void => {
    const t = tests[i];
    notes[i] = r.verdict === 'passed' ? undefined : r.message;
    const o: TestOutcome = { index: i, verdict: r.verdict };
    if (t.visible && r.verdict !== 'passed') {
      o.input = t.input;
      o.expected = t.output;
      o.got = r.got ?? r.message;
    }
    outcomes[i] = o;
  };

  // The first sample goes alone: a compile error, or a crash on every input, should not cost one run per test.
  const first = await runTest(language, source, tests[0]);
  done(0, first);
  if (first.verdict === 'compile_error') {
    for (let i = 1; i < tests.length; i++) outcomes[i] = { index: i, verdict: 'compile_error' };
    return { passed: 0, total: tests.length, outcomes, message: first.message };
  }

  const rest = tests.map((_, i) => i).slice(1);
  let next = 0;
  const lanes = Array.from({ length: Math.min(MAX_PARALLEL, rest.length) }, async () => {
    while (next < rest.length) {
      const i = rest[next++];
      const r = await runTest(language, source, tests[i]);
      done(i, r);
    }
  });
  await Promise.all(lanes);

  // one line for the student: the earliest failing test's compiler / runtime message, when it has one
  const firstFailing = outcomes.findIndex((o) => o.verdict !== 'passed');
  const message = firstFailing >= 0 ? notes[firstFailing] : undefined;
  return { passed: outcomes.filter((o) => o.verdict === 'passed').length, total: tests.length, outcomes, message };
}

/** A sample as the run button would use it (for the "Run on sample" button). */
export const firstSample = (problem: CodeProblem): QuizSample => problem.samples[0];
