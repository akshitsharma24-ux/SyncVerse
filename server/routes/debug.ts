/**
 * Lane D (Miti): P-D1 permission-gated debug access. In-memory grants; privacy is enforced here in the API.
 *   POST /api/debug/request        {ownerId}        -> DebugGrant
 *   POST /api/debug/:id/decision   {allow:boolean}  -> DebugGrant   (owner only)
 *   POST /api/debug/:id/revoke                      -> DebugGrant   (owner or grantee)
 *   GET  /api/debug/grants                          -> DebugGrant[] involving the caller (initial state)
 *   GET  /api/debug/events         SSE, per user: every grant change involving the caller
 * States: requested -> active -> revoked | expired, or requested -> denied. One live grant per (owner, grantee).
 */
import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import type { DebugGrant } from '@syncverse/shared';
import { requireUser } from '../identity';
import { logEvent, rememberUser } from './events';

const GRANT_MS = 30 * 60 * 1000;
const MAX_REQUESTS = 3;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;

type Scope = 'view' | 'assist';
interface Grant extends DebugGrant {
  roomCode: string;
  scope: Scope;
}

const grants = new Map<string, Grant>();
const requestLog = new Map<string, number[]>(); // granteeId -> request timestamps
const blocked = new Set<string>(); // `${ownerId}:${granteeId}`
const streams = new Map<string, Set<Response>>(); // userId -> open SSE responses
const streamRoom = new Map<Response, string>(); // which room each stream belongs to

// Suggested edits (assist scope): the helper proposes whole-file text, the owner accepts or rejects. Nothing is applied here.
const MAX_PROPOSAL_CHARS = 30_000;
const MIN_PROPOSAL_GAP_MS = 2000;
interface Proposal {
  id: string;
  grantId: string;
  ownerId: string;
  by: string;
  note: string;
  base: string; // the text the helper started from; the owner's editor must still match it to accept
  source: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: number;
}
const proposals = new Map<string, Proposal>();

function sendTo(userId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams.get(userId) ?? []) res.write(payload);
}

/** The owner's view of a pending suggestion (the only place the suggested text leaves the server). */
const proposalView = (p: Proposal) => ({ id: p.id, grantId: p.grantId, by: p.by, note: p.note, base: p.base, source: p.source, createdAt: p.createdAt });

/** When access ends, suggestions that were never answered disappear from the owner's screen. */
function withdrawProposals(grantId: string): void {
  for (const p of proposals.values()) {
    if (p.grantId === grantId && p.status === 'pending') {
      p.status = 'withdrawn';
      sendTo(p.ownerId, 'proposal-withdrawn', { id: p.id });
    }
  }
}

function expireDue(): void {
  const now = Date.now();
  for (const g of grants.values()) {
    if (g.status === 'active' && g.expiresAt !== undefined && g.expiresAt <= now) {
      g.status = 'expired';
      push(g);
    }
  }
}

/** DebugGrant plus `scope` (additive field; the shared type is Lane A's, so it is only added on the wire). */
function view(g: Grant): DebugGrant & { scope: Scope } {
  const { roomCode: _room, ...rest } = g;
  return rest;
}

function push(g: Grant): void {
  const payload = `data: ${JSON.stringify(view(g))}\n\n`;
  for (const uid of new Set([g.ownerId, g.granteeId])) {
    for (const res of streams.get(uid) ?? []) res.write(payload);
  }
  if (g.status !== 'active' && g.status !== 'requested') withdrawProposals(g.id);
}

function findLive(ownerId: string, granteeId: string): Grant | undefined {
  for (const g of grants.values()) {
    if (g.ownerId === ownerId && g.granteeId === granteeId && (g.status === 'requested' || g.status === 'active')) return g;
  }
  return undefined;
}

/** True when `viewerId` may read `ownerId`'s runs/explanations: the owner, or an active, unexpired grantee. */
export function canView(viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return true;
  expireDue();
  const g = findLive(ownerId, viewerId);
  return g?.status === 'active';
}

/** Demo reset (P-D3): forget every grant and block for this room. */
export function resetDebug(roomCode: string): void {
  for (const [id, g] of grants) {
    if (g.roomCode !== roomCode) continue;
    grants.delete(id);
    for (const [pid, p] of proposals) if (p.grantId === id) proposals.delete(pid);
  }
  blocked.clear();
  requestLog.clear();
}

export const router = Router();

router.post('/debug/request', requireUser, (req, res) => {
  const me = req.user!;
  const ownerId = typeof req.body?.ownerId === 'string' ? req.body.ownerId : '';
  const roomCode = typeof req.body?.roomCode === 'string' ? req.body.roomCode : '';
  if (!ownerId) return void res.status(400).json({ error: 'ownerId required' });
  if (ownerId === me.userId) return void res.status(400).json({ error: 'you already own your own session' });
  if (blocked.has(`${ownerId}:${me.userId}`)) return void res.status(403).json({ error: 'this person is not accepting requests from you' });
  expireDue();
  const existing = findLive(ownerId, me.userId);
  if (existing) return void res.json(view(existing));

  const now = Date.now();
  const recent = (requestLog.get(me.userId) ?? []).filter((t) => now - t < REQUEST_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    return void res.status(429).json({ error: 'too many requests, try again in a few minutes' });
  }
  requestLog.set(me.userId, [...recent, now]);

  const g: Grant = {
    id: randomUUID(),
    ownerId,
    granteeId: me.userId,
    granteeName: me.name,
    status: 'requested',
    createdAt: now,
    roomCode,
    scope: 'view',
  };
  grants.set(g.id, g);
  logEvent({ userId: ownerId, roomCode, at: now, type: 'debug_access', category: 'requested' });
  push(g);
  res.json(view(g));
});

router.post('/debug/:id/decision', requireUser, (req, res) => {
  const g = grants.get(String(req.params.id));
  if (!g) return void res.status(404).json({ error: 'no such request' });
  if (g.ownerId !== req.user!.userId) return void res.status(403).json({ error: 'only the owner decides' });
  if (g.status !== 'requested') return void res.status(409).json({ error: `already ${g.status}` });
  const allow = req.body?.allow === true;
  g.status = allow ? 'active' : 'denied';
  g.scope = allow && req.body?.scope === 'assist' ? 'assist' : 'view';
  if (allow) g.expiresAt = Date.now() + GRANT_MS;
  logEvent({ userId: g.ownerId, roomCode: g.roomCode, at: Date.now(), type: 'debug_access', category: allow ? 'allowed' : 'denied' });
  push(g);
  res.json(view(g));
});

/** Owner blocks a requester for the rest of the server session; also ends any live grant from them. */
router.post('/debug/:id/block', requireUser, (req, res) => {
  const g = grants.get(String(req.params.id));
  if (!g) return void res.status(404).json({ error: 'no such request' });
  if (g.ownerId !== req.user!.userId) return void res.status(403).json({ error: 'only the owner can block' });
  blocked.add(`${g.ownerId}:${g.granteeId}`);
  if (g.status === 'requested' || g.status === 'active') {
    g.status = 'denied';
    push(g);
  }
  res.json(view(g));
});

router.post('/debug/:id/revoke', requireUser, (req, res) => {
  const g = grants.get(String(req.params.id));
  if (!g) return void res.status(404).json({ error: 'no such grant' });
  const uid = req.user!.userId;
  if (g.ownerId !== uid && g.granteeId !== uid) return void res.status(403).json({ error: 'not your grant' });
  if (g.status === 'requested' || g.status === 'active') {
    g.status = 'revoked';
    push(g);
  }
  res.json(view(g));
});

/** Assist scope only: the grantee points at a line; the owner's editor highlights it. Never edits anything. */
router.post('/debug/:id/highlight', requireUser, (req, res) => {
  const g = grants.get(String(req.params.id));
  if (!g || g.granteeId !== req.user!.userId) return void res.status(403).json({ error: 'not your grant' });
  expireDue();
  if (g.status !== 'active' || g.scope !== 'assist') return void res.status(403).json({ error: 'assist access not granted' });
  const line = Number(req.body?.line);
  if (!Number.isInteger(line) || line < 1 || line > 100000) return void res.status(400).json({ error: 'bad line' });
  const payload = `event: highlight\ndata: ${JSON.stringify({ grantId: g.id, by: g.granteeName, line })}\n\n`;
  for (const r of streams.get(g.ownerId) ?? []) r.write(payload);
  res.json({ ok: true });
});

/**
 * Assist scope only: the grantee suggests an edit (whole-file text). It is shown to the owner as a diff; the owner's browser
 * applies it only after an explicit Accept. One pending suggestion per grant: a new one replaces the old one.
 */
router.post('/debug/:id/proposal', requireUser, (req, res) => {
  const g = grants.get(String(req.params.id));
  if (!g || g.granteeId !== req.user!.userId) return void res.status(403).json({ error: 'not your grant' });
  expireDue();
  if (g.status !== 'active' || g.scope !== 'assist') return void res.status(403).json({ error: 'assist access not granted' });
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  const base = typeof req.body?.base === 'string' ? req.body.base : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : '';
  if (!source.trim() || source.length > MAX_PROPOSAL_CHARS || base.length > MAX_PROPOSAL_CHARS) {
    return void res.status(400).json({ error: `send a non-empty source of at most ${MAX_PROPOSAL_CHARS} characters` });
  }
  if (source === base) return void res.status(400).json({ error: 'the suggestion is identical to the current code' });
  const now = Date.now();
  for (const p of proposals.values()) {
    if (p.grantId === g.id && now - p.createdAt < MIN_PROPOSAL_GAP_MS) return void res.status(429).json({ error: 'wait a moment before sending another suggestion' });
  }
  withdrawProposals(g.id); // replaces any earlier unanswered suggestion
  const p: Proposal = { id: randomUUID(), grantId: g.id, ownerId: g.ownerId, by: g.granteeName, note, base, source, status: 'pending', createdAt: now };
  proposals.set(p.id, p);
  sendTo(g.ownerId, 'proposal', proposalView(p));
  res.json({ id: p.id });
});

/** Owner only: accept or reject a pending suggestion. The edit itself is applied by the owner's own editor. */
router.post('/debug/:id/proposal/:pid/decision', requireUser, (req, res) => {
  const p = proposals.get(String(req.params.pid));
  if (!p || p.grantId !== String(req.params.id)) return void res.status(404).json({ error: 'no such suggestion' });
  if (p.ownerId !== req.user!.userId) return void res.status(403).json({ error: 'only the owner decides' });
  if (p.status !== 'pending') return void res.status(409).json({ error: `already ${p.status}` });
  const accepted = req.body?.accepted === true;
  p.status = accepted ? 'accepted' : 'rejected';
  const g = grants.get(p.grantId);
  if (g) sendTo(g.granteeId, 'proposal-result', { id: p.id, accepted, by: req.user!.name });
  logEvent({ userId: p.ownerId, roomCode: g?.roomCode ?? '', at: Date.now(), type: 'debug_access', category: accepted ? 'proposal_accepted' : 'proposal_rejected', ok: accepted });
  res.json({ ok: true });
});

/** Owner only: suggestions still waiting for an answer (restores the review dialog after a page refresh). */
router.get('/debug/proposals', requireUser, (req, res) => {
  expireDue();
  const uid = req.user!.userId;
  res.json([...proposals.values()].filter((p) => p.ownerId === uid && p.status === 'pending').map(proposalView));
});

/** Mentor broadcast: one short banner message to everyone else in the room. Status-style, no data attached. */
router.post('/broadcast', requireUser, (req, res) => {
  const me = req.user!;
  if (me.role !== 'mentor') return void res.status(403).json({ error: 'mentors only' });
  const room = typeof req.body?.roomCode === 'string' ? req.body.roomCode : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 200) : '';
  if (!room || !message) return void res.status(400).json({ error: 'roomCode and message required' });
  const payload = `event: broadcast\ndata: ${JSON.stringify({ from: me.name, message })}\n\n`;
  let sent = 0;
  for (const [uid, set] of streams) {
    if (uid === me.userId) continue;
    for (const r of set) {
      if (streamRoom.get(r) === room) {
        r.write(payload);
        sent++;
      }
    }
  }
  res.json({ sent });
});

router.get('/debug/grants', requireUser, (req, res) => {
  expireDue();
  const uid = req.user!.userId;
  res.json([...grants.values()].filter((g) => g.ownerId === uid || g.granteeId === uid).map(view));
});

router.get('/debug/events', requireUser, (req, res) => {
  const uid = req.user!.userId;
  rememberUser(uid, req.user!.name, typeof req.query.room === 'string' ? req.query.room : undefined);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(': connected\n\n');
  let set = streams.get(uid);
  if (!set) streams.set(uid, (set = new Set()));
  set.add(res);
  streamRoom.set(res, typeof req.query.room === 'string' ? req.query.room : '');
  const beat = setInterval(() => {
    expireDue();
    res.write(': ping\n\n');
  }, 15000);
  req.on('close', () => {
    clearInterval(beat);
    set!.delete(res);
    streamRoom.delete(res);
    // Access ends when the student leaves: no open stream for 20 s -> revoke their live grants.
    setTimeout(() => {
      if ((streams.get(uid)?.size ?? 0) > 0) return;
      for (const g of grants.values()) {
        if (g.ownerId === uid && (g.status === 'active' || g.status === 'requested')) {
          g.status = 'revoked';
          push(g);
        }
      }
    }, 20000);
  });
});
