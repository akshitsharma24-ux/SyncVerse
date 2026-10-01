/**
 * Quiz state for every room: the quiz being run (or just finished), the earlier ones, who answered what, and the leaderboard.
 * Pure rules, no HTTP: routes/quiz.ts calls into it. Saved to <data>/quizzes.json so a server restart does not lose a live quiz.
 *
 * A room has one current quiz at a time, in three states:
 *   lobby    created by a mentor, questions chosen, students told to wait
 *   running  started: the clock is ticking, answers count
 *   ended    time ran out or the mentor ended it: final leaderboard, answers revealed. Stays visible until a new quiz is created.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DIFFICULTY_POINTS,
  QUIZ_LIMITS,
  compareRows,
  type CellState,
  type LeaderRow,
  type MyAnswer,
  type QuestionStat,
  type QuizConfig,
  type QuizSnapshot,
  type QuizView,
  type TestOutcome,
} from '@syncverse/shared';
import { dataDir } from '../paths';
import { logger } from '../logger';
import { isRegistered, roomView } from '../roomstore';
import { pickQuestions, poolSize, publicQuestion, questionById, revealOf, type QuizQuestion } from './bank';

const log = logger('quiz');

interface Answer {
  choice?: number;
  correct?: boolean;
  passed?: number;
  total?: number;
  attempts: number;
  points: number;
  /** ms after the start when this answer last improved the score */
  improvedAt?: number;
  last?: MyAnswer['last'];
}
interface Player {
  userId: string;
  name: string;
  answers: Record<string, Answer>;
}
interface Quiz {
  id: string;
  room: string;
  config: QuizConfig;
  status: 'lobby' | 'running' | 'ended';
  createdBy: { userId: string; name: string };
  createdAt: number;
  startedAt?: number;
  endsAt?: number;
  endedAt?: number;
  questionIds: string[];
  players: Record<string, Player>;
  /** the students of the room when the quiz ended: a finished quiz's board does not change when people come and go later */
  roster?: { userId: string; name: string }[];
}
interface RoomQuizzes {
  current: Quiz | null;
  past: Quiz[];
}

const MAX_PAST = 10;
const rooms = new Map<string, RoomQuizzes>();
const timers = new Map<string, NodeJS.Timeout>();
const judging = new Map<string, number>(); // quiz id -> submissions being judged right now
let loaded = false;

const file = (): string => path.join(dataDir(), 'quizzes.json');

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as { rooms?: Record<string, RoomQuizzes> };
    for (const [code, r] of Object.entries(raw.rooms ?? {})) rooms.set(code, r);
    for (const [code, r] of rooms) if (r.current?.status === 'running') arm(code, r.current);
  } catch {
    /* first run */
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(flushQuizStore, 600);
}
export function flushQuizStore(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!loaded) return;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ rooms: Object.fromEntries(rooms) }));
    fs.renameSync(tmp, file());
  } catch (err) {
    log.error('could not save the quizzes', err);
  }
}

// ---------------------------------------------------------------------------------------------- events
type Listener = (room: string) => void;
const listeners = new Set<Listener>();
export function onQuizChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed(room: string): void {
  scheduleSave();
  for (const fn of listeners) {
    try {
      fn(room);
    } catch (err) {
      log.error('quiz listener failed', err);
    }
  }
}

function arm(room: string, quiz: Quiz): void {
  const old = timers.get(quiz.id);
  if (old) clearTimeout(old);
  const wait = Math.max(0, (quiz.endsAt ?? 0) - Date.now()) + 50;
  const t = setTimeout(() => {
    timers.delete(quiz.id);
    end(room, 'time');
  }, Math.min(wait, 2_000_000_000));
  t.unref?.();
  timers.set(quiz.id, t);
}

// ---------------------------------------------------------------------------------------------- access
export type Denied = { ok: false; error: 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'closed'; message: string };
const denied = (error: Denied['error'], message: string): Denied => ({ ok: false, error, message });
export type Actor = { userId: string; name: string };

function roomState(code: string): RoomQuizzes {
  load();
  let r = rooms.get(code);
  if (!r) {
    r = { current: null, past: [] };
    rooms.set(code, r);
  }
  return r;
}

/** Ends a quiz whose time is up, wherever it is noticed first. */
function settle(code: string): Quiz | null {
  const r = roomState(code);
  const q = r.current;
  if (q && q.status === 'running' && (q.endsAt ?? Infinity) <= Date.now()) end(code, 'time');
  return r.current;
}

// ------------------------------------------------------------------------------------------- lifecycle
export function validConfig(input: Partial<QuizConfig>): { ok: true; config: QuizConfig } | Denied {
  const topics = [...new Set(input.topics ?? [])];
  if (!topics.length) return denied('invalid', 'Pick at least one topic.');
  const count = Math.round(Number(input.count));
  if (!(count >= QUIZ_LIMITS.minCount && count <= QUIZ_LIMITS.maxCount)) return denied('invalid', `Choose between ${QUIZ_LIMITS.minCount} and ${QUIZ_LIMITS.maxCount} questions.`);
  const minutes = Math.round(Number(input.minutes) * 100) / 100;
  const minMinutes = Number(process.env.QUIZ_MIN_MINUTES ?? QUIZ_LIMITS.minMinutes); // tests lower it to run a quiz that ends in seconds
  if (!(minutes >= minMinutes && minutes <= QUIZ_LIMITS.maxMinutes)) return denied('invalid', `Choose a time between ${QUIZ_LIMITS.minMinutes} and ${QUIZ_LIMITS.maxMinutes} minutes.`);
  const title = (input.title ?? '').trim().replace(/\s+/g, ' ').slice(0, QUIZ_LIMITS.maxTitle) || 'DSA quiz';
  return {
    ok: true,
    config: {
      title,
      topics,
      difficulty: input.difficulty ?? 'mixed',
      format: input.format ?? 'mixed',
      count,
      minutes,
      liveBoard: input.liveBoard !== false,
    },
  };
}

export function createQuiz(code: string, by: Actor, config: QuizConfig): { ok: true } | Denied {
  const r = roomState(code);
  settle(code);
  if (r.current && r.current.status !== 'ended') return denied('conflict', 'A quiz is already open in this room. End or cancel it first.');
  if (poolSize(config.topics, config.format) < 1) return denied('invalid', 'There are no questions for that choice of topics and format.');
  const questions = pickQuestions(config, Math.floor(Math.random() * 2 ** 31));
  if (questions.length < config.count && questions.length < 2) return denied('invalid', 'There are not enough questions for those topics.');
  if (r.current) {
    r.past.unshift(r.current);
    r.past.length = Math.min(r.past.length, MAX_PAST);
  }
  r.current = {
    id: randomUUID(),
    room: code,
    config: { ...config, count: questions.length },
    status: 'lobby',
    createdBy: { userId: by.userId, name: by.name },
    createdAt: Date.now(),
    questionIds: questions.map((x) => x.id),
    players: {},
  };
  log.info('quiz created', { room: code, by: by.userId, questions: questions.length, topics: config.topics, level: config.difficulty });
  changed(code);
  return { ok: true };
}

export function rerollQuiz(code: string): { ok: true } | Denied {
  const q = settle(code);
  if (!q) return denied('not_found', 'There is no quiz to change.');
  if (q.status !== 'lobby') return denied('conflict', 'Questions can only be reshuffled before the quiz starts.');
  const questions = pickQuestions(q.config, Math.floor(Math.random() * 2 ** 31));
  q.questionIds = questions.map((x) => x.id);
  q.config.count = questions.length;
  changed(code);
  return { ok: true };
}

export function startQuiz(code: string): { ok: true } | Denied {
  const q = settle(code);
  if (!q) return denied('not_found', 'There is no quiz to start.');
  if (q.status !== 'lobby') return denied('conflict', 'This quiz has already started.');
  q.status = 'running';
  q.startedAt = Date.now();
  q.endsAt = q.startedAt + q.config.minutes * 60_000;
  arm(code, q);
  log.info('quiz started', { room: code, id: q.id, minutes: q.config.minutes });
  changed(code);
  return { ok: true };
}

export function end(code: string, why: 'time' | 'mentor'): { ok: true } | Denied {
  const q = roomState(code).current;
  if (!q) return denied('not_found', 'There is no quiz to end.');
  if (q.status !== 'running') return denied('conflict', 'This quiz is not running.');
  q.status = 'ended';
  q.endedAt = why === 'time' ? (q.endsAt ?? Date.now()) : Date.now();
  q.roster = currentStudents(code);
  const t = timers.get(q.id);
  if (t) clearTimeout(t);
  timers.delete(q.id);
  log.info('quiz ended', { room: code, id: q.id, why });
  changed(code);
  return { ok: true };
}

export function cancelQuiz(code: string): { ok: true } | Denied {
  const r = roomState(code);
  const q = settle(code);
  if (!q) return denied('not_found', 'There is no quiz to cancel.');
  if (q.status === 'ended') return denied('conflict', 'This quiz is finished. Start a new one instead.');
  const t = timers.get(q.id);
  if (t) clearTimeout(t);
  timers.delete(q.id);
  r.current = null;
  log.info('quiz cancelled', { room: code, id: q.id });
  changed(code);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- answers
function openQuiz(code: string, userId: string, questionId: string): { quiz: Quiz; question: QuizQuestion; player: Player } | Denied {
  const q = settle(code);
  if (!q || q.status === 'lobby') return denied('closed', 'The quiz has not started yet.');
  if (q.status === 'ended') return denied('closed', 'The quiz is over: answers are closed.');
  const question = questionById(questionId);
  if (!question || !q.questionIds.includes(questionId)) return denied('not_found', 'That question is not part of this quiz.');
  const player = (q.players[userId] ??= { userId, name: '', answers: {} });
  return { quiz: q, question, player };
}

export function answerMcq(code: string, who: Actor, questionId: string, choice: number): { ok: true; correct: boolean; points: number } | Denied {
  const open = openQuiz(code, who.userId, questionId);
  if ('ok' in open) return open;
  const { quiz, question, player } = open;
  if (question.type !== 'mcq') return denied('invalid', 'That is a coding question: submit code for it.');
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return denied('invalid', 'Pick one of the options.');
  if (player.answers[questionId]) return denied('conflict', 'You already answered this question.');
  player.name = who.name;
  const correct = choice === question.answer;
  const points = correct ? DIFFICULTY_POINTS[question.difficulty] : 0;
  player.answers[questionId] = { choice, correct, attempts: 1, points, improvedAt: correct ? Date.now() - (quiz.startedAt ?? Date.now()) : undefined };
  changed(code);
  return { ok: true, correct, points };
}

export function beginJudging(code: string, who: Actor, questionId: string): { ok: true; quiz: Quiz; question: QuizQuestion } | Denied {
  const open = openQuiz(code, who.userId, questionId);
  if ('ok' in open) return open;
  if (open.question.type !== 'code') return denied('invalid', 'That is a multiple-choice question.');
  open.player.name = who.name;
  judging.set(open.quiz.id, (judging.get(open.quiz.id) ?? 0) + 1);
  changed(code);
  return { ok: true, quiz: open.quiz, question: open.question };
}

export function finishJudging(
  code: string,
  who: Actor,
  quizId: string,
  questionId: string,
  language: string,
  result: { passed: number; total: number; outcomes: TestOutcome[]; message?: string } | null,
): MyAnswer | null {
  judging.set(quizId, Math.max(0, (judging.get(quizId) ?? 1) - 1));
  const r = roomState(code);
  const q = [r.current, ...r.past].find((x) => x?.id === quizId);
  const question = questionById(questionId);
  if (!q || !question || question.type !== 'code') return null;
  const player = (q.players[who.userId] ??= { userId: who.userId, name: who.name, answers: {} });
  if (!result) {
    changed(code);
    return null; // the runner failed: nothing is counted, the student can try again
  }
  const mine = (player.answers[questionId] ??= { attempts: 0, points: 0 });
  mine.attempts++;
  // Full marks only when every test passed: rounding must never turn "19 of 20 tests" into a full score.
  const full = DIFFICULTY_POINTS[question.difficulty];
  const points = result.total > 0 && result.passed === result.total ? full : Math.min(full - 1, Math.floor((full * result.passed) / Math.max(1, result.total)));
  mine.last = { language, at: Date.now(), passed: result.passed, total: result.total, outcomes: result.outcomes, message: result.message };
  if (points > mine.points) {
    mine.points = points;
    mine.improvedAt = Date.now() - (q.startedAt ?? Date.now());
  }
  if (mine.passed === undefined || result.passed > mine.passed) {
    mine.passed = result.passed;
    mine.total = result.total;
  }
  changed(code);
  return toMyAnswer(mine);
}

const toMyAnswer = (a: Answer): MyAnswer => ({
  choice: a.choice,
  correct: a.correct,
  passed: a.passed,
  total: a.total,
  attempts: a.attempts,
  points: a.points,
  last: a.last,
});

// ---------------------------------------------------------------------------------------------- views
function cellOf(question: QuizQuestion | undefined, a: Answer | undefined): { state: CellState; points: number } {
  if (!a || !question) return { state: 'none', points: 0 };
  const full = DIFFICULTY_POINTS[question.difficulty];
  if (a.points >= full) return { state: 'full', points: a.points };
  if (a.points > 0) return { state: 'partial', points: a.points };
  return { state: 'wrong', points: 0 };
}

/** The students of the room right now (not the owner or mentors, not removed people). */
function currentStudents(room: string): { userId: string; name: string }[] {
  const view = isRegistered(room) ? roomView(room) : undefined;
  return (view?.members ?? []).filter((m) => !m.removed && m.role === 'student' && m.userId !== view?.ownerId).map((m) => ({ userId: m.userId, name: m.name }));
}

function leaderboardOf(q: Quiz): LeaderRow[] {
  const questions = q.questionIds.map((id) => questionById(id));
  const people = new Map<string, { name: string }>();
  // everyone who is a student in the room (so the mentor sees who has not started), plus anyone who answered
  for (const m of q.roster ?? currentStudents(q.room)) people.set(m.userId, { name: m.name });
  for (const p of Object.values(q.players)) people.set(p.userId, { name: p.name || people.get(p.userId)?.name || 'Student' });

  const rows = [...people].map(([userId, who]): LeaderRow => {
    const player = q.players[userId];
    const cells = questions.map((question, i) => cellOf(question, player?.answers[q.questionIds[i]]));
    const improved = Object.values(player?.answers ?? {})
      .map((a) => (a.points > 0 ? a.improvedAt : undefined))
      .filter((t): t is number => t !== undefined);
    return {
      rank: 0,
      userId,
      name: who.name,
      score: cells.reduce((n, c) => n + c.points, 0),
      solved: cells.filter((c) => c.state === 'full').length,
      attempted: cells.filter((c) => c.state !== 'none').length,
      lastAt: improved.length ? Math.max(...improved) : null,
      cells,
    };
  });
  rows.sort(compareRows);
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.score === row.score && prev.lastAt === row.lastAt ? prev.rank : i + 1;
  });
  return rows;
}

function statsOf(q: Quiz, rows: LeaderRow[]): QuestionStat[] {
  return q.questionIds.map((id, i) => {
    const question = questionById(id);
    const full = question ? DIFFICULTY_POINTS[question.difficulty] : 1;
    const tried = rows.filter((r) => r.cells[i]?.state !== 'none');
    return {
      id,
      full: rows.filter((r) => r.cells[i]?.state === 'full').length,
      attempted: tried.length,
      avgShare: tried.length ? tried.reduce((n, r) => n + (r.cells[i]?.points ?? 0) / full, 0) / tried.length : 0,
    };
  });
}

export function viewOf(q: Quiz, viewer: { userId: string; canManage: boolean }): QuizView {
  const ended = q.status === 'ended';
  const questions = q.questionIds.map((id) => questionById(id)).filter((x): x is QuizQuestion => Boolean(x));
  const rows = leaderboardOf(q);
  const showQuestions = q.status !== 'lobby' || viewer.canManage;
  const showBoard = viewer.canManage || ended || (q.status === 'running' && q.config.liveBoard);
  const me = q.players[viewer.userId];
  const mineRow = rows.find((r) => r.userId === viewer.userId);
  return {
    id: q.id,
    title: q.config.title,
    config: q.config,
    status: q.status,
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    startedAt: q.startedAt,
    endsAt: q.endsAt,
    endedAt: q.endedAt,
    serverNow: Date.now(),
    questions: showQuestions ? questions.map(publicQuestion) : [],
    questionCount: questions.length,
    totalPoints: questions.reduce((n, x) => n + DIFFICULTY_POINTS[x.difficulty], 0),
    reveal: ended || viewer.canManage ? questions.map(revealOf) : undefined,
    leaderboard: showBoard ? rows : null,
    stats: viewer.canManage || ended ? statsOf(q, rows) : undefined,
    mine: viewer.canManage
      ? undefined
      : {
          answers: Object.fromEntries(Object.entries(me?.answers ?? {}).map(([id, a]) => [id, toMyAnswer(a)])),
          score: mineRow?.score ?? 0,
          rank: showBoard && mineRow && mineRow.attempted > 0 ? mineRow.rank : null,
          of: rows.length,
        },
    participants: rows.length,
    judging: judging.get(q.id) ?? 0,
  };
}

export function snapshotFor(code: string, viewer: { userId: string; canManage: boolean; canAnswer: boolean }): QuizSnapshot {
  const q = settle(code);
  const r = roomState(code);
  return {
    active: q ? viewOf(q, viewer) : null,
    past: r.past.map((p) => viewOf(p, viewer)),
    canManage: viewer.canManage,
    canAnswer: viewer.canAnswer,
  };
}

/** Raw access for tests and the route (is there a running quiz this question belongs to?). */
export function currentQuiz(code: string): Quiz | null {
  return settle(code);
}

/** Forget a room's quizzes (the room was deleted). */
export function dropRoom(code: string): void {
  const r = rooms.get(code);
  if (r?.current) {
    const t = timers.get(r.current.id);
    if (t) clearTimeout(t);
  }
  rooms.delete(code);
  scheduleSave();
}

export type { Quiz };
