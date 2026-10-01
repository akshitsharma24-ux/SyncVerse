/**
 * Quiz / contest routes. A mentor creates a timed DSA quiz for the room, students answer, everyone watches the leaderboard.
 *
 *   GET  /api/quiz/catalog        topics with how many questions each level has, and the languages the runner supports
 *   GET  /api/quiz                the room's quiz as this person may see it (QuizSnapshot)
 *   GET  /api/quiz/stream         server-sent events: the same snapshot, pushed whenever anything changes
 *   POST /api/quiz/create         mentor: { title?, topics, difficulty, format, count, minutes, liveBoard }
 *   POST /api/quiz/reroll         mentor: choose other questions (before the start)
 *   POST /api/quiz/start          mentor
 *   POST /api/quiz/end            mentor: end now
 *   POST /api/quiz/cancel         mentor: drop a quiz that has not finished
 *   POST /api/quiz/answer         student: { questionId, choice }            multiple choice, one try
 *   POST /api/quiz/run            student: { language, source, stdin }       try a program on any input (no score)
 *   POST /api/quiz/submit         student: { questionId, language, source }  judged on every test, best result counts
 * The room is named by the x-room header (web/src/api.ts adds it). Answers and hidden tests never leave the server.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { HEADER_ROOM, QUIZ_LIMITS, QUIZ_TOPIC_IDS, type QuizCatalog } from '@syncverse/shared';
import { requireUser } from '../identity';
import { logger } from '../logger';
import { isModerator, isRegistered, memberOf, onRoomEvent } from '../roomstore';
import { ServiceError, availableLanguages, isRunLanguage, runOnce } from './run';
import { catalog } from '../quiz/bank';
import { judge } from '../quiz/judge';
import {
  answerMcq,
  beginJudging,
  cancelQuiz,
  createQuiz,
  dropRoom,
  end,
  finishJudging,
  onQuizChange,
  rerollQuiz,
  snapshotFor,
  startQuiz,
  validConfig,
  type Denied,
} from '../quiz/store';

const log = logger('quiz');
export const router = Router();

const CODE = /^[a-z0-9_-]{1,40}$/;
const STATUS: Record<Denied['error'], number> = { forbidden: 403, not_found: 404, invalid: 400, conflict: 409, closed: 409 };
const MAX_SOURCE = 50_000;
const MAX_STDIN = 10 * 1024;
const MIN_RUN_GAP_MS = Number(process.env.QUIZ_RUN_GAP_MS ?? 1500);
const MIN_SUBMIT_GAP_MS = Number(process.env.QUIZ_SUBMIT_GAP_MS ?? 3000);

interface Access {
  room: string;
  userId: string;
  name: string;
  canManage: boolean;
  canAnswer: boolean;
}

/** Who this is in the room. Registered rooms use the room's own record; a legacy room trusts the claimed role. */
function accessFor(room: string, user: { userId: string; name: string; role: string }): Access | Denied {
  if (isRegistered(room)) {
    const m = memberOf(room, user.userId);
    if (!m || m.removed) return { ok: false, error: 'forbidden', message: 'Join the room first.' };
    const canManage = isModerator(room, user.userId);
    return { room, userId: user.userId, name: m.name || user.name, canManage, canAnswer: !canManage && m.role === 'student' };
  }
  const canManage = user.role === 'mentor';
  return { room, userId: user.userId, name: user.name, canManage, canAnswer: !canManage && user.role === 'student' };
}

function access(req: Request, res: Response): Access | null {
  const user = req.user!;
  const raw = req.header(HEADER_ROOM) ?? (typeof req.query.uroom === 'string' ? req.query.uroom : '');
  const room = raw.toLowerCase();
  if (!CODE.test(room)) {
    res.status(400).json({ error: 'bad_room', message: 'Join a room first.' });
    return null;
  }
  const a = accessFor(room, user);
  if ('ok' in a) {
    res.status(STATUS[a.error]).json({ error: a.error, message: a.message });
    return null;
  }
  return a;
}

function manager(req: Request, res: Response): Access | null {
  const a = access(req, res);
  if (!a) return null;
  if (!a.canManage) {
    res.status(403).json({ error: 'forbidden', message: 'Only the owner or a mentor can do that.' });
    return null;
  }
  return a;
}

function student(req: Request, res: Response): Access | null {
  const a = access(req, res);
  if (!a) return null;
  if (!a.canAnswer) {
    res.status(403).json({ error: 'forbidden', message: a.canManage ? 'Mentors run the quiz; students answer it.' : 'Viewers can watch but not answer.' });
    return null;
  }
  return a;
}

const reply = (res: Response, r: { ok: true } | Denied, ok: () => unknown = () => ({ ok: true })): void => {
  if (r.ok) res.json(ok());
  else res.status(STATUS[r.error]).json({ error: r.error, message: r.message });
};

// ------------------------------------------------------------------------------------------------ reads
router.get('/quiz/catalog', requireUser, (_req, res) => {
  const body: QuizCatalog = { topics: catalog(), languages: [...availableLanguages()] };
  res.json({ ...body, limits: QUIZ_LIMITS });
});

router.get('/quiz', requireUser, (req, res) => {
  const a = access(req, res);
  if (!a) return;
  res.json(snapshotFor(a.room, a));
});

// Server-sent events. A change in any quiz schedules one push per connection of that room (several changes within 250 ms are one push).
interface Conn {
  res: Response;
  room: string;
  user: { userId: string; name: string; role: string };
}
const conns = new Set<Conn>();
const pushTimers = new Map<string, NodeJS.Timeout>();

function pushRoom(room: string): void {
  for (const c of conns) {
    if (c.room !== room) continue;
    const a = accessFor(room, c.user);
    if ('ok' in a) continue;
    try {
      c.res.write(`data: ${JSON.stringify(snapshotFor(room, a))}\n\n`);
    } catch {
      conns.delete(c);
    }
  }
}

onQuizChange((room) => {
  if (pushTimers.has(room)) return;
  const t = setTimeout(() => {
    pushTimers.delete(room);
    pushRoom(room);
  }, 250);
  pushTimers.set(room, t);
});

// A deleted room takes its quizzes with it.
onRoomEvent((ev) => {
  if (ev.type === 'deleted') dropRoom(ev.code);
});

router.get('/quiz/stream', requireUser, (req, res) => {
  const a = access(req, res);
  if (!a) return;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write(`data: ${JSON.stringify(snapshotFor(a.room, a))}\n\n`);
  const conn: Conn = { res, room: a.room, user: { userId: req.user!.userId, name: req.user!.name, role: req.user!.role } };
  conns.add(conn);
  const beat = setInterval(() => res.write(': keep-alive\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(beat);
    conns.delete(conn);
  });
});

// ------------------------------------------------------------------------------------------- mentor actions
const createBody = z.object({
  title: z.string().max(200).optional(),
  topics: z.array(z.enum(QUIZ_TOPIC_IDS as [string, ...string[]])).min(1),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  format: z.enum(['mcq', 'code', 'mixed']),
  count: z.number(),
  minutes: z.number(),
  liveBoard: z.boolean().optional(),
});

router.post('/quiz/create', requireUser, (req, res) => {
  const a = manager(req, res);
  if (!a) return;
  const body = createBody.safeParse(req.body ?? {});
  if (!body.success) return void res.status(400).json({ error: 'invalid', message: 'Pick at least one topic, a difficulty, a format, how many questions and how long.' });
  const v = validConfig(body.data as never);
  if (!v.ok) return void res.status(STATUS[v.error]).json({ error: v.error, message: v.message });
  reply(res, createQuiz(a.room, a, v.config), () => snapshotFor(a.room, a));
});

router.post('/quiz/reroll', requireUser, (req, res) => {
  const a = manager(req, res);
  if (a) reply(res, rerollQuiz(a.room), () => snapshotFor(a.room, a));
});
router.post('/quiz/start', requireUser, (req, res) => {
  const a = manager(req, res);
  if (a) reply(res, startQuiz(a.room), () => snapshotFor(a.room, a));
});
router.post('/quiz/end', requireUser, (req, res) => {
  const a = manager(req, res);
  if (a) reply(res, end(a.room, 'mentor'), () => snapshotFor(a.room, a));
});
router.post('/quiz/cancel', requireUser, (req, res) => {
  const a = manager(req, res);
  if (a) reply(res, cancelQuiz(a.room), () => snapshotFor(a.room, a));
});

// ------------------------------------------------------------------------------------------ student actions
router.post('/quiz/answer', requireUser, (req, res) => {
  const a = student(req, res);
  if (!a) return;
  const body = z.object({ questionId: z.string().max(80), choice: z.number() }).safeParse(req.body ?? {});
  if (!body.success) return void res.status(400).json({ error: 'invalid', message: 'Pick one of the options.' });
  const r = answerMcq(a.room, a, body.data.questionId, body.data.choice);
  if (!r.ok) return void res.status(STATUS[r.error]).json({ error: r.error, message: r.message });
  res.json({ correct: r.correct, points: r.points });
});

const lastRun = new Map<string, number>();
const lastSubmit = new Map<string, number>();
const submitting = new Set<string>();

router.post('/quiz/run', requireUser, async (req, res) => {
  const a = student(req, res);
  if (!a) return;
  const body = z.object({ language: z.string(), source: z.string().max(MAX_SOURCE), stdin: z.string().max(MAX_STDIN).default('') }).safeParse(req.body ?? {});
  if (!body.success || !isRunLanguage(body.data.language) || !availableLanguages().includes(body.data.language)) {
    return void res.status(400).json({ error: 'invalid', message: `Choose a language the runner supports (${availableLanguages().join(', ')}).` });
  }
  if (!body.data.source.trim()) return void res.status(400).json({ error: 'invalid', message: 'There is no code to run.' });
  const now = Date.now();
  if (now - (lastRun.get(a.userId) ?? 0) < MIN_RUN_GAP_MS) return void res.status(429).json({ error: 'too_fast', message: 'You are running too fast. Wait a second.' });
  lastRun.set(a.userId, now);
  try {
    const out = await runOnce(body.data.language, body.data.source, body.data.stdin);
    res.json({ status: out.status, stdout: out.stdout.slice(0, 20_000), stderr: out.stderr.slice(-4000), compileOutput: out.compileOutput.slice(-4000), timeMs: out.timeMs });
  } catch (e) {
    res.status(503).json({ error: 'runner', message: e instanceof ServiceError ? e.message : 'The code runner failed. Try again.' });
  }
});

router.post('/quiz/submit', requireUser, async (req, res) => {
  const a = student(req, res);
  if (!a) return;
  const body = z.object({ questionId: z.string().max(80), language: z.string(), source: z.string().max(MAX_SOURCE) }).safeParse(req.body ?? {});
  if (!body.success || !isRunLanguage(body.data.language) || !availableLanguages().includes(body.data.language)) {
    return void res.status(400).json({ error: 'invalid', message: `Choose a language the runner supports (${availableLanguages().join(', ')}).` });
  }
  if (!body.data.source.trim()) return void res.status(400).json({ error: 'invalid', message: 'There is no code to submit.' });
  if (submitting.has(a.userId)) return void res.status(429).json({ error: 'busy', message: 'Your last submission is still being judged.' });
  const now = Date.now();
  if (now - (lastSubmit.get(a.userId) ?? 0) < MIN_SUBMIT_GAP_MS) return void res.status(429).json({ error: 'too_fast', message: 'Wait a few seconds between submissions.' });

  const begun = beginJudging(a.room, a, body.data.questionId);
  if (!begun.ok) return void res.status(STATUS[begun.error]).json({ error: begun.error, message: begun.message });
  if (begun.question.type !== 'code') return void res.status(400).json({ error: 'invalid', message: 'That is a multiple-choice question.' });
  lastSubmit.set(a.userId, now);
  submitting.add(a.userId);
  try {
    const result = await judge(begun.question, body.data.language, body.data.source);
    const answer = finishJudging(a.room, a, begun.quiz.id, body.data.questionId, body.data.language, result);
    log.info('submission judged', { room: a.room, user: a.userId, question: body.data.questionId, language: body.data.language, passed: result.passed, total: result.total });
    res.json({ answer, result });
  } catch (e) {
    finishJudging(a.room, a, begun.quiz.id, body.data.questionId, body.data.language, null);
    if (!(e instanceof ServiceError)) log.error('judging failed', e);
    res.status(503).json({ error: 'runner', message: e instanceof ServiceError ? `${e.message} Nothing was counted: try again.` : 'Judging failed inside the server. Nothing was counted: try again.' });
  } finally {
    submitting.delete(a.userId);
  }
});
