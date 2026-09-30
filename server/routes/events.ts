/**
 * Lane D (Miti): P-D2 learning events and progress. Owns logEvent and the aggregates.
 *   GET  /api/progress/me     -> ProgressSummary for the caller
 *   GET  /api/progress/room   -> mentor table for the caller's room (mentors only)
 *   POST /api/demo/seed       {roomCode} -> P-D3: seed history for demo personas and the caller
 *   POST /api/demo/reset      {roomCode} -> drop seeded personas and this room's events
 * Coarse events only: no code, no keystrokes. Observations, not scores.
 */
import { Router } from 'express';
import type { LearningEvent } from '@syncverse/shared';
import { requireUser } from '../identity';

let events: LearningEvent[] = [];
const names = new Map<string, string>(); // userId -> display name
const rooms = new Map<string, string>(); // userId -> last room

/** Every lane calls this when something learning-relevant happens (run finished, explain asked, patch decided...). */
export function logEvent(e: LearningEvent): void {
  events.push(e);
  rooms.set(e.userId, e.roomCode);
}

export function getEvents(): readonly LearningEvent[] {
  return events;
}

/** Called by Lane D routes so the mentor table can show names. */
export function rememberUser(userId: string, name: string, roomCode?: string): void {
  names.set(userId, name);
  if (roomCode) rooms.set(userId, roomCode);
}

// ------------------------------------------------------------------------------------- concepts
const CATEGORY_RULES: { match: RegExp; label: string; concepts: string[] }[] = [
  { match: /index/i, label: 'IndexError', concepts: ['lists-arrays', 'loop-boundaries'] },
  { match: /name/i, label: 'NameError', concepts: ['variables-types'] },
  { match: /syntax|indentation|compile/i, label: 'SyntaxError', concepts: ['syntax-basics'] },
  { match: /recursion/i, label: 'RecursionError', concepts: ['recursion'] },
  { match: /timeout|time.?limit/i, label: 'Timeout', concepts: ['loops'] },
];

function classify(category?: string): { label: string; concepts: string[] } | undefined {
  if (!category) return undefined;
  const hit = CATEGORY_RULES.find((r) => r.match.test(category));
  return hit ? { label: hit.label, concepts: hit.concepts } : { label: category, concepts: [] };
}

const CONCEPT_NAMES: Record<string, string> = {
  'lists-arrays': 'lists and arrays',
  'loop-boundaries': 'loop boundaries',
  'variables-types': 'variables',
  'syntax-basics': 'syntax basics',
  recursion: 'recursion',
  loops: 'loops',
};
const conceptName = (c: string) => CONCEPT_NAMES[c] ?? c.replace(/-/g, ' ');

// ------------------------------------------------------------------------------------ aggregates
export interface ProgressSummary {
  userId: string;
  runs: number;
  successes: number;
  failures: number;
  successRatePct: number | null;
  errorCategories: { label: string; count: number }[];
  aiExplains: number;
  patchesAccepted: number;
  patchesRejected: number;
  concepts: string[];
  streak: number; // failed runs in a row, latest first
  observations: string[];
  recent: { at: number; ok: boolean; label?: string }[]; // oldest -> newest, last 10 runs
}

function summarize(userId: string, all: readonly LearningEvent[]): ProgressSummary {
  const mine = all.filter((e) => e.userId === userId).sort((a, b) => a.at - b.at);
  const runEvents = mine.filter((e) => e.type === 'run');
  const last10 = runEvents.slice(-10);
  const cats = new Map<string, { count: number; concepts: string[] }>();
  const conceptSet = new Set<string>();
  for (const e of mine) for (const c of e.concepts ?? []) conceptSet.add(c);
  for (const e of runEvents) {
    if (e.ok) continue;
    const c = classify(e.category);
    if (!c) continue;
    const cur = cats.get(c.label) ?? { count: 0, concepts: c.concepts };
    cur.count++;
    cats.set(c.label, cur);
    for (const k of c.concepts) conceptSet.add(k);
  }

  let streak = 0;
  for (let i = runEvents.length - 1; i >= 0 && !runEvents[i].ok; i--) streak++;

  const observations: string[] = [];
  const latest = runEvents[runEvents.length - 1];
  const recentFailures = new Map<string, number>();
  for (const e of last10) {
    if (!e.ok) {
      const c = classify(e.category);
      if (c) recentFailures.set(c.label, (recentFailures.get(c.label) ?? 0) + 1);
    }
  }
  for (const [label, n] of recentFailures) {
    if (n >= 3 && latest && !latest.ok) {
      const concepts = CATEGORY_RULES.find((r) => r.label === label)?.concepts ?? [];
      const topic = concepts.length ? concepts.map(conceptName).join(' and ') : label;
      observations.push(`Retry recommended: ${topic}. ${n} of your last ${last10.length} runs ended in ${label}.`);
    }
  }
  if (latest?.ok && runEvents.length > 1 && runEvents.slice(0, -1).some((e) => !e.ok)) {
    observations.push('Your latest run succeeded after earlier errors. Worth noting what changed.');
  }
  const explains = mine.filter((e) => e.type === 'explain').length;
  if (explains > 0) observations.push(`You asked the AI to explain an error ${explains} time${explains === 1 ? '' : 's'}.`);
  const acc = mine.filter((e) => e.type === 'patch' && e.ok).length;
  const rej = mine.filter((e) => e.type === 'patch' && e.ok === false).length;
  if (acc + rej > 0) observations.push(`You reviewed ${acc + rej} AI patch${acc + rej === 1 ? '' : 'es'}: ${acc} accepted, ${rej} rejected. You stay in control.`);
  if (runEvents.length === 0) observations.push('No runs yet. Run your code to start building a picture.');

  const successes = runEvents.filter((e) => e.ok).length;
  return {
    userId,
    runs: runEvents.length,
    successes,
    failures: runEvents.length - successes,
    successRatePct: runEvents.length ? Math.round((successes / runEvents.length) * 100) : null,
    errorCategories: [...cats].map(([label, v]) => ({ label, count: v.count })).sort((a, b) => b.count - a.count),
    aiExplains: explains,
    patchesAccepted: acc,
    patchesRejected: rej,
    concepts: [...conceptSet].map(conceptName),
    streak,
    observations,
    recent: last10.map((e) => ({ at: e.at, ok: !!e.ok, label: e.ok ? undefined : classify(e.category)?.label })),
  };
}

export interface RoomRow {
  userId: string;
  name: string;
  runs: number;
  failures: number;
  topError: string | null;
  streak: number;
  stuck: boolean;
  lastRun: 'ok' | 'failed' | null;
  lastError: string | null;
}

// ----------------------------------------------------------------------------------------- routes
export const router = Router();

router.get('/progress/me', requireUser, (req, res) => {
  const me = req.user!;
  rememberUser(me.userId, me.name, typeof req.query.room === 'string' ? req.query.room : undefined);
  res.json(summarize(me.userId, events));
});

router.get('/progress/room', requireUser, (req, res) => {
  const me = req.user!;
  if (me.role !== 'mentor') return void res.status(403).json({ error: 'mentors only' });
  const room = typeof req.query.room === 'string' ? req.query.room : rooms.get(me.userId);
  const ids = new Set<string>();
  for (const e of events) if (e.roomCode === room && e.userId !== me.userId) ids.add(e.userId);
  const rows: RoomRow[] = [...ids].map((id) => {
    const s = summarize(id, events.filter((e) => e.roomCode === room));
    return {
      userId: id,
      name: names.get(id) ?? 'Student',
      runs: s.runs,
      failures: s.failures,
      topError: s.errorCategories[0]?.label ?? null,
      streak: s.streak,
      stuck: s.streak >= 3,
      lastRun: s.recent.length ? (s.recent[s.recent.length - 1].ok ? 'ok' : 'failed') : null,
      lastError: s.recent.length ? s.recent[s.recent.length - 1].label ?? null : null,
    };
  });
  res.json({ room, rows });
});

// ------------------------------------------------------------------------------------- demo seed
const PERSONAS = [
  { id: 'seed-asha', name: 'Asha (demo)', script: ['IndexError', 'IndexError', 'IndexError'] },
  { id: 'seed-ravi', name: 'Ravi (demo)', script: ['NameError', 'ok', 'SyntaxError', 'ok'] },
  { id: 'seed-meera', name: 'Meera (demo)', script: ['ok', 'ok', 'RecursionError', 'ok'] },
] as const;

function seedRun(userId: string, roomCode: string, at: number, cat: string): LearningEvent[] {
  const ok = cat === 'ok';
  const c = classify(ok ? undefined : cat);
  const out: LearningEvent[] = [{ userId, roomCode, at, type: 'run', category: ok ? undefined : cat, concepts: c?.concepts, ok }];
  if (!ok) out.push({ userId, roomCode, at: at + 1, type: 'explain', category: cat, concepts: c?.concepts });
  return out;
}

router.post('/demo/seed', requireUser, (req, res) => {
  const me = req.user!;
  const roomCode = typeof req.body?.roomCode === 'string' && req.body.roomCode ? req.body.roomCode : 'demo';
  const base = Date.now() - 3 * 60 * 60 * 1000;
  const added: LearningEvent[] = [];
  const has = (id: string) => events.some((e) => e.userId === id && e.roomCode === roomCode && e.type === 'run');
  for (const p of PERSONAS) {
    if (has(p.id)) continue;
    names.set(p.id, p.name);
    p.script.forEach((cat, i) => added.push(...seedRun(p.id, roomCode, base + i * 10 * 60 * 1000, cat)));
  }
  if (!has(me.userId)) {
    ['IndexError', 'ok', 'IndexError', 'IndexError', 'IndexError'].forEach((cat, i) =>
      added.push(...seedRun(me.userId, roomCode, base + i * 8 * 60 * 1000, cat)),
    );
  }
  for (const e of added) logEvent(e);
  rememberUser(me.userId, me.name, roomCode);
  res.json({ seeded: added.length });
});

router.post('/demo/reset', requireUser, (req, res) => {
  const roomCode = typeof req.body?.roomCode === 'string' ? req.body.roomCode : '';
  events = events.filter((e) => e.roomCode !== roomCode);
  res.json({ ok: true });
});
