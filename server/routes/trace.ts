/**
 * Step-through debugger routes (Python). A person runs their own code under the tracer and replays it step by step in the browser; a
 * mentor with an ACTIVE debug grant (routes/debug.ts) can read the same trace and follows the student's position live.
 *   POST /api/debug/trace           {roomCode, source, stdin?, language?}  -> DebugTrace (also stored as the caller's latest)
 *   GET  /api/debug/trace/latest    ?ownerId=   -> { trace, position }     (owner, or an active grantee: same rule as runs)
 *   POST /api/debug/trace/position  {id, step}  -> { ok }                  (owner only; pushed to the mentors watching)
 * Server-sent events to watchers (on the existing /api/debug/events stream): `trace` (a new trace) and `trace-step` (the position).
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { DebugTrace } from '@syncverse/shared';
import { requireUser } from '../identity';
import { buildHarness, parseTraceOutput } from '../debugger/pytrace';
import { canView, notifyViewers } from './debug';
import { logEvent } from './events';
import { ServiceError, runOnce } from './run';

const MAX_SOURCE_CHARS = 100_000;
const MAX_STDIN_BYTES = 10 * 1024;
const MIN_GAP_MS = Number(process.env.TRACE_MIN_GAP_MS ?? 1000);
const MAX_KEPT = 200; // latest traces kept in memory (one per person): the oldest session is dropped past this

const latest = new Map<string, DebugTrace>(); // ownerId -> the trace they made last
const positions = new Map<string, number>(); // trace id -> the step the owner is looking at
const lastStart = new Map<string, number>();
const running = new Set<string>();

export const router = Router();

router.post('/debug/trace', requireUser, async (req, res) => {
  const me = req.user!;
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  const stdin = typeof req.body?.stdin === 'string' ? req.body.stdin : '';
  const roomCode = typeof req.body?.roomCode === 'string' ? req.body.roomCode : '';
  const language = typeof req.body?.language === 'string' ? req.body.language : 'python';
  if (language !== 'python') {
    return void res.status(400).json({ error: 'unsupported_language', message: 'Step-through debugging works for Python. Switch the file to Python to use it; Run works in every language.' });
  }
  if (!source.trim()) return void res.status(400).json({ error: 'empty', message: 'There is no code to debug.' });
  if (source.length > MAX_SOURCE_CHARS) return void res.status(400).json({ error: 'too_big', message: 'The code is too long to step through.' });
  if (Buffer.byteLength(stdin, 'utf8') > MAX_STDIN_BYTES) return void res.status(400).json({ error: 'too_big', message: 'The input is too large (limit 10 KB).' });
  if (running.has(me.userId)) return void res.status(429).json({ error: 'busy', message: 'Your last debug run is still going. Wait a moment.' });
  const now = Date.now();
  if (now - (lastStart.get(me.userId) ?? 0) < MIN_GAP_MS) return void res.status(429).json({ error: 'too_fast', message: 'You are debugging too fast. Wait a second.' });
  lastStart.set(me.userId, now);
  running.add(me.userId);
  try {
    const started = Date.now();
    const out = await runOnce('python', buildHarness(source), stdin);
    const parsed = parseTraceOutput(out.stdout);
    if (!parsed) {
      const message = out.status === 'timeout' ? 'The program took too long to step through (limit 5 seconds). Try it with smaller input.' : 'The debugger could not trace this program. Run it normally to see its error.';
      return void res.status(502).json({ error: 'trace_failed', message });
    }
    const trace: DebugTrace = {
      id: randomUUID(),
      ownerId: me.userId,
      ownerName: me.name,
      roomCode,
      language: 'python',
      source,
      stdin,
      steps: parsed.steps,
      output: parsed.output,
      ...(parsed.error ? { error: parsed.error } : {}),
      truncated: parsed.truncated,
      createdAt: Date.now(),
      durationMs: Date.now() - started,
    };
    const old = latest.get(me.userId);
    if (old) positions.delete(old.id);
    latest.delete(me.userId); // re-insert at the end so the oldest session is the first to go
    latest.set(me.userId, trace);
    positions.set(trace.id, 0);
    while (latest.size > MAX_KEPT) {
      const [oldest, gone] = latest.entries().next().value as [string, DebugTrace];
      latest.delete(oldest);
      positions.delete(gone.id);
    }
    logEvent({ userId: me.userId, roomCode, at: trace.createdAt, type: 'trace', category: parsed.error?.type ?? 'ok', ok: !parsed.error });
    notifyViewers(me.userId, 'trace', { ownerId: me.userId, ownerName: me.name, id: trace.id, steps: trace.steps.length, error: parsed.error?.type ?? null });
    res.json(trace);
  } catch (e) {
    res.status(503).json({ error: 'runner', message: e instanceof ServiceError ? e.message : 'The code runner failed. Try again.' });
  } finally {
    running.delete(me.userId);
  }
});

router.get('/debug/trace/latest', requireUser, (req, res) => {
  const me = req.user!;
  const q = req.query.ownerId;
  const ownerId = typeof q === 'string' && q ? q : me.userId;
  if (ownerId !== me.userId && !canView(me.userId, ownerId)) return void res.status(403).json({ error: 'forbidden', message: 'This debug session is private to its owner.' });
  const trace = latest.get(ownerId) ?? null;
  res.json({ trace, position: trace ? (positions.get(trace.id) ?? 0) : 0 });
});

router.post('/debug/trace/position', requireUser, (req, res) => {
  const me = req.user!;
  const mine = latest.get(me.userId);
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const step = Number(req.body?.step);
  if (!mine || mine.id !== id) return void res.status(404).json({ error: 'not_found', message: 'That debug session is not yours or is out of date.' });
  if (!Number.isInteger(step) || step < 0 || step >= Math.max(1, mine.steps.length)) return void res.status(400).json({ error: 'bad_step', message: 'That step does not exist.' });
  positions.set(id, step);
  notifyViewers(me.userId, 'trace-step', { ownerId: me.userId, id, step });
  res.json({ ok: true });
});
