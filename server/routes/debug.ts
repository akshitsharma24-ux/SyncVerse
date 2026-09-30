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

interface Grant extends DebugGrant {
  roomCode: string;
}

const grants = new Map<string, Grant>();
const requestLog = new Map<string, number[]>(); // granteeId -> request timestamps
const streams = new Map<string, Set<Response>>(); // userId -> open SSE responses

function expireDue(): void {
  const now = Date.now();
  for (const g of grants.values()) {
    if (g.status === 'active' && g.expiresAt !== undefined && g.expiresAt <= now) {
      g.status = 'expired';
      push(g);
    }
  }
}

function view(g: Grant): DebugGrant {
  const { roomCode: _room, ...rest } = g;
  return rest;
}

function push(g: Grant): void {
  const payload = `data: ${JSON.stringify(view(g))}\n\n`;
  for (const uid of new Set([g.ownerId, g.granteeId])) {
    for (const res of streams.get(uid) ?? []) res.write(payload);
  }
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

export const router = Router();

router.post('/debug/request', requireUser, (req, res) => {
  const me = req.user!;
  const ownerId = typeof req.body?.ownerId === 'string' ? req.body.ownerId : '';
  const roomCode = typeof req.body?.roomCode === 'string' ? req.body.roomCode : '';
  if (!ownerId) return void res.status(400).json({ error: 'ownerId required' });
  if (ownerId === me.userId) return void res.status(400).json({ error: 'you already own your own session' });
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
  if (allow) g.expiresAt = Date.now() + GRANT_MS;
  logEvent({ userId: g.ownerId, roomCode: g.roomCode, at: Date.now(), type: 'debug_access', category: allow ? 'allowed' : 'denied' });
  push(g);
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
  const beat = setInterval(() => {
    expireDue();
    res.write(': ping\n\n');
  }, 15000);
  req.on('close', () => {
    clearInterval(beat);
    set!.delete(res);
  });
});
