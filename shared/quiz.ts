/**
 * Quiz / contest contract. A mentor creates a timed DSA quiz for a room; students answer privately; everyone sees a live leaderboard.
 * Used by the server (server/quiz, routes/quiz.ts) and the web panel (web/src/quiz). Answers and hidden tests never leave the
 * server: the browser only ever receives the *Public* shapes below.
 */

export type QuizDifficulty = 'easy' | 'medium' | 'hard';
/** What the teacher picks: one level, or a ramp from easy to hard. */
export type QuizLevel = QuizDifficulty | 'mixed';
export type QuizFormat = 'mcq' | 'code' | 'mixed';
export type QuizStatus = 'lobby' | 'running' | 'ended';

export const QUIZ_TOPICS = [
  { id: 'arrays', label: 'Arrays', blurb: 'Indexing, sums, windows' },
  { id: 'strings', label: 'Strings', blurb: 'Characters, substrings, anagrams' },
  { id: 'hashing', label: 'Hash maps and sets', blurb: 'Counting, lookup, duplicates' },
  { id: 'stacks', label: 'Stacks and queues', blurb: 'Brackets, monotonic stacks, windows' },
  { id: 'search', label: 'Binary search and sorting', blurb: 'Halving, merging, search on the answer' },
  { id: 'recursion', label: 'Recursion and backtracking', blurb: 'Base cases, choices, counting' },
  { id: 'dp', label: 'Dynamic programming', blurb: 'Overlapping subproblems' },
  { id: 'graphs', label: 'Graphs and grids', blurb: 'BFS, DFS, shortest paths' },
] as const;
export type QuizTopic = (typeof QUIZ_TOPICS)[number]['id'];
export const QUIZ_TOPIC_IDS: QuizTopic[] = QUIZ_TOPICS.map((t) => t.id);
export const isQuizTopic = (v: unknown): v is QuizTopic => typeof v === 'string' && (QUIZ_TOPIC_IDS as string[]).includes(v);

/** Points a fully solved question is worth (LeetCode's Easy / Medium / Hard). A coding question pays by the share of tests passed. */
export const DIFFICULTY_POINTS: Record<QuizDifficulty, number> = { easy: 10, medium: 20, hard: 30 };
export const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const QUIZ_LIMITS = { minCount: 2, maxCount: 10, minMinutes: 3, maxMinutes: 180, maxTitle: 60 } as const;

/** The five things a mentor is asked, plus one switch. */
export interface QuizConfig {
  title: string;
  topics: QuizTopic[];
  difficulty: QuizLevel;
  format: QuizFormat;
  count: number;
  minutes: number;
  /** students may watch the leaderboard while the quiz runs (the mentor always can); the final board is always shared */
  liveBoard: boolean;
}

export interface QuizSample {
  input: string;
  output: string;
}

/** A question as a student sees it. No answers, no hidden tests. */
export interface PublicQuestion {
  id: string;
  type: 'mcq' | 'code';
  topic: QuizTopic;
  difficulty: QuizDifficulty;
  points: number;
  title: string;
  /** mcq: the question (may hold a code block, fenced with ```) */
  prompt?: string;
  options?: string[];
  /** code: the problem */
  statement?: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string;
  samples?: QuizSample[];
  /** how many tests judge a submission (visible and hidden) */
  testCount?: number;
}

/** Revealed to everyone once the quiz has ended. */
export interface QuestionReveal {
  id: string;
  /** mcq: index of the right option */
  answer?: number;
  explanation?: string;
  /** code: a model solution (Python) */
  solution?: string;
}

export type CellState = 'full' | 'partial' | 'wrong' | 'none';

export interface LeaderCell {
  state: CellState;
  points: number;
}

export interface LeaderRow {
  rank: number;
  userId: string;
  name: string;
  color?: string;
  score: number;
  /** questions answered completely right */
  solved: number;
  /** questions the person has attempted */
  attempted: number;
  /** milliseconds after the start of the quiz when the score last went up */
  lastAt: number | null;
  cells: LeaderCell[];
}

export type Verdict = 'passed' | 'wrong' | 'runtime_error' | 'timeout' | 'compile_error' | 'service_error';

export interface TestOutcome {
  index: number;
  verdict: Verdict;
  /** shown only for the visible sample tests, and for hidden ones never */
  input?: string;
  expected?: string;
  got?: string;
}

export interface MyAnswer {
  /** mcq: the option the person locked in */
  choice?: number;
  /** mcq: was it right (told straight away, the right option only after the quiz ends) */
  correct?: boolean;
  /** code: best result so far */
  passed?: number;
  total?: number;
  attempts?: number;
  points: number;
  /** code: how the latest submission went */
  last?: { language: string; at: number; passed: number; total: number; outcomes: TestOutcome[]; message?: string };
}

export interface QuestionStat {
  id: string;
  /** people with full marks / people who attempted / people in the quiz */
  full: number;
  attempted: number;
  /** average share of the points, 0..1, among people who attempted */
  avgShare: number;
}

export interface QuizView {
  id: string;
  title: string;
  config: QuizConfig;
  status: QuizStatus;
  createdBy: { userId: string; name: string };
  createdAt: number;
  startedAt?: number;
  endsAt?: number;
  endedAt?: number;
  /** server clock when this was sent: the browser corrects its timer by (serverNow - Date.now()) */
  serverNow: number;
  /** students: only after the start. The mentor: always (the lobby preview). */
  questions: PublicQuestion[];
  /** how many questions there will be (students see this in the lobby) */
  questionCount: number;
  totalPoints: number;
  /** present once the quiz has ended */
  reveal?: QuestionReveal[];
  /** null when this person may not see it yet (students, while the mentor hides the live board) */
  leaderboard: LeaderRow[] | null;
  /** mentor: how a question went for the class (always); students: after the end */
  stats?: QuestionStat[];
  /** this person's own answers (students) */
  mine?: { answers: Record<string, MyAnswer>; score: number; rank: number | null; of: number };
  /** the mentor sees how many people are in the room and how many submissions are still being judged */
  participants: number;
  judging: number;
}

export interface QuizSnapshot {
  active: QuizView | null;
  /** finished quizzes of this room, newest first */
  past: QuizView[];
  canManage: boolean;
  canAnswer: boolean;
}

export interface QuizCatalog {
  topics: { id: QuizTopic; label: string; blurb: string; counts: Record<QuizDifficulty, { mcq: number; code: number }> }[];
  languages: string[];
}

/** Leaderboard order: score, then who got there first. */
export function compareRows(a: Pick<LeaderRow, 'score' | 'lastAt' | 'name'>, b: Pick<LeaderRow, 'score' | 'lastAt' | 'name'>): number {
  return b.score - a.score || (a.lastAt ?? Infinity) - (b.lastAt ?? Infinity) || a.name.localeCompare(b.name);
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
