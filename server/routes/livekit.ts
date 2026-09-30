/**
 * Lane A (Akshit): P-A4 video dock token.
 *   GET /api/livekit/token?room=<roomCode>  -> { token, url }
 * Identity comes from the request user (x-user-* headers); ?identity= and ?name= are a fallback for manual testing.
 * Keys (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) come from .env; without them the route answers 503.
 * Media goes browser <-> LiveKit Cloud directly; this route only signs a short-lived join token.
 */
import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { isRegistered, memberOf } from '../roomstore';

export const router = Router();

router.get('/livekit/token', async (req, res) => {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) {
    res.status(503).json({
      error: 'livekit_not_configured',
      hint: 'Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env (created in task P-D0), then restart the server.',
    });
    return;
  }

  const room = String(req.query.room ?? '').toLowerCase();
  const identity = req.user?.userId ?? String(req.query.identity ?? '');
  const name = req.user?.name ?? String(req.query.name ?? 'Guest');
  if (!/^[a-z0-9_-]{1,40}$/.test(room) || !identity) {
    res.status(400).json({ error: 'need ?room=<code> and an identity (x-user-id header)' });
    return;
  }

  // Registered rooms only let their members into the call; viewers can watch and listen but not speak or share.
  let viewer = false;
  if (isRegistered(room)) {
    const m = memberOf(room, identity);
    if (!m || m.removed) {
      res.status(403).json({ error: 'not_a_member', message: 'Join the room before joining its call.' });
      return;
    }
    viewer = m.role === 'viewer';
  }

  const at = new AccessToken(key, secret, { identity, name, ttl: '2h' });
  at.addGrant({ roomJoin: true, room: `sv-${room}`, canPublish: !viewer, canSubscribe: true, canPublishData: !viewer });
  res.json({ token: await at.toJwt(), url });
});
