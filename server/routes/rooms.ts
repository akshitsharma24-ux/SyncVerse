/**
 * Lane A: rooms, roles, moderation and version history. All routes need an identity (guest headers or an account token).
 *
 *   GET  /api/rooms                                       my rooms (accounts: across devices; guests: this tab's id)
 *   POST /api/rooms/:code/join            { role }        creates the room if new (you become owner); returns { room, me, created, downgraded? }
 *   GET  /api/rooms/:code                                 room + members (members only)
 *   GET  /api/rooms/:code/stream                          server-sent events: { type: 'state', room } | 'deleted' | 'removed'
 *   POST /api/rooms/:code/members/:userId { role?, muted?, removed? }        moderation (owner; mentors for students/viewers)
 *   POST /api/rooms/:code/members/:userId/mute-audio      mute that person's microphone in the video call (needs LiveKit keys)
 *   POST /api/rooms/:code/mute-all-audio                  mute every non-mentor microphone
 *   POST /api/rooms/:code/settings        { name?, lockMentorSeats?, frozen? }
 *   POST /api/rooms/:code/delete                          owner only
 *   GET  /api/rooms/:code/versions                        saved copies, newest first
 *   GET  /api/rooms/:code/versions/:id                    { version, files } for previewing
 *   POST /api/rooms/:code/versions        { label? }      save a copy now
 *   POST /api/rooms/:code/versions/:id/restore            put a copy back (saves "Before restore" first)
 */
import { Router, type Request, type Response } from 'express';
import { RoomServiceClient, TrackType } from 'livekit-server-sdk';
import { z } from 'zod';
import type { MemberView } from '@syncverse/shared';
import { requireUser } from '../identity';
import { logger } from '../logger';
import { restoreSnapshot, takeSnapshot } from '../collab';
import { getVersion, listVersions } from '../versions';
import { canWrite, deleteRoom, isModerator, isOwner, joinRoom, memberOf, moderate, onRoomEvent, roomView, roomsFor, updateSettings } from '../roomstore';

const log = logger('rooms');
export const router = Router();

const CODE = /^[a-z0-9_-]{1,40}$/;
const role = z.enum(['student', 'mentor', 'viewer']);

function codeOf(req: Request, res: Response): string | null {
  const code = String(req.params.code ?? '').toLowerCase();
  if (!CODE.test(code)) {
    res.status(400).json({ error: 'bad_code', message: 'Room codes use letters, numbers, - and _ (up to 40).' });
    return null;
  }
  return code;
}

/** The caller as a member of this room, or an error response. */
function memberFor(req: Request, res: Response): { code: string; me: MemberView } | null {
  const code = codeOf(req, res);
  if (!code) return null;
  if (!roomView(code)) {
    res.status(404).json({ error: 'not_found', message: 'That room does not exist.' });
    return null;
  }
  const me = memberOf(code, req.user!.userId);
  if (!me || me.removed) {
    res.status(403).json({ error: me ? 'removed' : 'not_a_member', message: me ? 'You were removed from this room.' : 'Join the room first.' });
    return null;
  }
  return { code, me };
}

const STATUS = { forbidden: 403, not_found: 404, invalid: 400 } as const;

// ---------------------------------------------------------------------------------------------- rooms
router.get('/rooms', requireUser, (req, res) => {
  res.json({ rooms: roomsFor(req.user!.userId) });
});

router.post('/rooms/:code/join', requireUser, (req, res) => {
  const code = codeOf(req, res);
  if (!code) return;
  const parsed = z.object({ role: role.default('student') }).safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: 'invalid', message: 'role must be student, mentor or viewer' });
  const r = joinRoom(code, { userId: req.user!.userId, name: req.user!.name }, parsed.data.role);
  if (!r.ok) {
    return void (r.error === 'removed'
      ? res.status(403).json({ error: 'removed', message: 'A mentor removed you from this room, so you cannot join it again unless they allow it.' })
      : res.status(409).json({ error: 'full', message: 'This room is full.' }));
  }
  res.status(r.created ? 201 : 200).json({ room: r.room, me: r.me, created: r.created, downgraded: r.downgraded });
});

router.get('/rooms/:code', requireUser, (req, res) => {
  const m = memberFor(req, res);
  if (!m) return;
  res.json({ room: roomView(m.code), me: m.me });
});

router.get('/rooms/:code/stream', requireUser, (req, res) => {
  const m = memberFor(req, res);
  if (!m) return;
  const { code } = m;
  const userId = req.user!.userId;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  const push = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  push({ type: 'state', room: roomView(code) });
  const off = onRoomEvent((ev) => {
    if (ev.code !== code) return;
    if (ev.type === 'state') push({ type: 'state', room: ev.room });
    else if (ev.type === 'member-removed' && ev.userId === userId) push({ type: 'removed' });
    else if (ev.type === 'deleted') {
      push({ type: 'deleted' });
      res.end();
    }
  });
  const beat = setInterval(() => res.write(': keep-alive\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(beat);
    off();
  });
});

router.post('/rooms/:code/members/:userId', requireUser, (req, res) => {
  const code = codeOf(req, res);
  if (!code) return;
  const parsed = z.object({ role: role.optional(), muted: z.boolean().optional(), removed: z.boolean().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: 'invalid', message: 'Nothing valid to change.' });
  const r = moderate(code, req.user!.userId, String(req.params.userId), parsed.data);
  if (!r.ok) return void res.status(STATUS[r.error]).json({ error: r.error, message: r.message });
  log.info('member changed', { code, by: req.user!.userId, target: req.params.userId, ...parsed.data });
  res.json({ room: r.room });
});

router.post('/rooms/:code/settings', requireUser, (req, res) => {
  const code = codeOf(req, res);
  if (!code) return;
  const parsed = z.object({ name: z.string().max(200).optional(), lockMentorSeats: z.boolean().optional(), frozen: z.boolean().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: 'invalid', message: 'Nothing valid to change.' });
  const r = updateSettings(code, req.user!.userId, parsed.data);
  if (!r.ok) return void res.status(STATUS[r.error]).json({ error: r.error, message: r.message });
  res.json({ room: r.room });
});

router.post('/rooms/:code/delete', requireUser, (req, res) => {
  const code = codeOf(req, res);
  if (!code) return;
  const r = deleteRoom(code, req.user!.userId);
  if (!r.ok) return void res.status(STATUS[r.error]).json({ error: r.error, message: r.message });
  res.json({ ok: true });
});

// -------------------------------------------------------------------------------- mute microphones (LiveKit)
function livekit(): RoomServiceClient | null {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  return new RoomServiceClient(url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'), key, secret);
}

/** Mutes every live microphone track of one person. Returns how many were muted (0 when they are not in the call). */
async function muteMic(svc: RoomServiceClient, code: string, identity: string): Promise<number> {
  let info;
  try {
    info = await svc.getParticipant(`sv-${code}`, identity);
  } catch {
    return 0; // not in the call right now
  }
  let n = 0;
  for (const t of info.tracks) {
    if (t.type === TrackType.AUDIO && !t.muted) {
      await svc.mutePublishedTrack(`sv-${code}`, identity, t.sid, true);
      n++;
    }
  }
  return n;
}

const NOT_CONFIGURED = { error: 'livekit_not_configured', message: 'Video is not set up on this server, so there is nothing to mute.' };

router.post('/rooms/:code/members/:userId/mute-audio', requireUser, async (req, res) => {
  const code = codeOf(req, res);
  if (!code) return;
  if (!isModerator(code, req.user!.userId)) return void res.status(403).json({ error: 'forbidden', message: 'Only the owner or a mentor can mute someone.' });
  const target = memberOf(code, String(req.params.userId));
  if (!target) return void res.status(404).json({ error: 'not_found', message: 'That person is not in this room.' });
  if (target.owner || (target.role === 'mentor' && !isOwner(code, req.user!.userId))) return void res.status(403).json({ error: 'forbidden', message: 'You cannot mute that person.' });
  const svc = livekit();
  if (!svc) return void res.status(503).json(NOT_CONFIGURED);
  try {
    res.json({ muted: await muteMic(svc, code, target.userId) });
  } catch (err) {
    log.error('mute failed', { code, error: err });
    res.status(502).json({ error: 'livekit_error', message: 'The video service did not accept the request.' });
  }
});

router.post('/rooms/:code/mute-all-audio', requireUser, async (req, res) => {
  const code = codeOf(req, res);
  if (!code) return;
  if (!isModerator(code, req.user!.userId)) return void res.status(403).json({ error: 'forbidden', message: 'Only the owner or a mentor can mute everyone.' });
  const svc = livekit();
  if (!svc) return void res.status(503).json(NOT_CONFIGURED);
  try {
    let muted = 0;
    for (const m of roomView(code)?.members ?? []) if (!m.removed && m.role !== 'mentor' && !m.owner) muted += await muteMic(svc, code, m.userId);
    res.json({ muted });
  } catch (err) {
    log.error('mute-all failed', { code, error: err });
    res.status(502).json({ error: 'livekit_error', message: 'The video service did not accept the request.' });
  }
});

// -------------------------------------------------------------------------------------------- versions
const canSave = (me: MemberView) => me.role !== 'viewer';
const who = (req: Request) => ({ userId: req.user!.userId, name: req.user!.name });

router.get('/rooms/:code/versions', requireUser, (req, res) => {
  const m = memberFor(req, res);
  if (!m) return;
  res.json({ versions: listVersions(m.code) });
});

router.get('/rooms/:code/versions/:id', requireUser, (req, res) => {
  const m = memberFor(req, res);
  if (!m) return;
  const v = getVersion(m.code, String(req.params.id));
  if (!v) return void res.status(404).json({ error: 'not_found', message: 'That version no longer exists.' });
  const { files, hash: _hash, ...version } = v;
  res.json({ version, files });
});

router.post('/rooms/:code/versions', requireUser, (req, res) => {
  const m = memberFor(req, res);
  if (!m) return;
  if (!canSave(m.me)) return void res.status(403).json({ error: 'forbidden', message: 'Viewers cannot save versions.' });
  const label = typeof req.body?.label === 'string' ? req.body.label : '';
  const version = takeSnapshot(m.code, label, who(req));
  log.info('version saved', { code: m.code, by: req.user!.userId });
  res.status(201).json({ version });
});

router.post('/rooms/:code/versions/:id/restore', requireUser, (req, res) => {
  const m = memberFor(req, res);
  if (!m) return;
  if (!canWrite(m.code, req.user!.userId)) return void res.status(403).json({ error: 'forbidden', message: 'You cannot change the code right now, so you cannot restore a version.' });
  const id = String(req.params.id);
  if (!getVersion(m.code, id)) return void res.status(404).json({ error: 'not_found', message: 'That version no longer exists.' });
  const backup = takeSnapshot(m.code, 'Before restore', who(req));
  restoreSnapshot(m.code, id);
  log.info('version restored', { code: m.code, by: req.user!.userId, version: id });
  res.json({ restored: true, backup });
});
