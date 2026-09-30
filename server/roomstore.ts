/**
 * Room registry: who owns each room, who is in it, and what role they hold. Owner: Lane A.
 * Pure data + rules (no HTTP, no sockets), so identity, the collab server and the routes can all use it.
 *
 * Roles: mentor, student, viewer (read-only). The creator is the OWNER (mentor powers that cannot be taken away).
 *  - Joining: you ask for a role. The owner can lock mentor seats: newcomers who ask for mentor become students (mentors
 *    who are already in keep their seat).
 *  - A moderator (owner, or a mentor) can change a member's role, pause their editing, or remove them. Mentors can only
 *    moderate students and viewers; only the owner can promote to mentor, lock mentor seats, rename or delete the room.
 *  - A role set by a moderator sticks: the member can only ask for LESS privilege afterwards (viewer < student < mentor).
 * Rooms nobody registered (a raw /collab/<code> connection from a script) are "legacy": open, as before.
 * Persisted to <data>/rooms.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MemberView, Role, RoomSummary, RoomView } from '@syncverse/shared';
import { dataDir } from './paths';
import { logger } from './logger';

const log = logger('rooms');

interface MemberRec {
  userId: string;
  name: string;
  role: Role;
  byModerator: boolean;
  muted: boolean;
  removed: boolean;
  joinedAt: number;
  lastSeenAt: number;
}
interface RoomRec {
  code: string;
  name: string;
  ownerId: string;
  createdAt: number;
  lastActiveAt: number;
  lockMentorSeats: boolean;
  frozen: boolean;
  members: Record<string, MemberRec>;
}

const RANK: Record<Role, number> = { viewer: 0, student: 1, mentor: 2 };
export const MAX_MEMBERS = 200;

let rooms: Map<string, RoomRec> | null = null;
const file = () => path.join(dataDir(), 'rooms.json');

function load(): Map<string, RoomRec> {
  if (rooms) return rooms;
  rooms = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as { rooms?: RoomRec[] };
    for (const r of raw.rooms ?? []) rooms.set(r.code, r);
  } catch {
    /* first run */
  }
  return rooms;
}

let timer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
  if (timer) return;
  timer = setTimeout(flushRoomStore, 500);
}

export function flushRoomStore(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!rooms) return;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ rooms: [...rooms.values()] }));
    fs.renameSync(tmp, file());
  } catch (err) {
    log.error('could not save the room registry', err);
  }
}

// ---------------------------------------------------------------------------------------------- events
export type RoomEvent =
  | { type: 'state'; code: string; room: RoomView }
  | { type: 'member-removed'; code: string; userId: string }
  | { type: 'deleted'; code: string };

const listeners = new Set<(ev: RoomEvent) => void>();
export function onRoomEvent(fn: (ev: RoomEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(ev: RoomEvent): void {
  listeners.forEach((fn) => {
    try {
      fn(ev);
    } catch (err) {
      log.error('room listener failed', err);
    }
  });
}
function publish(rec: RoomRec): void {
  scheduleSave();
  emit({ type: 'state', code: rec.code, room: toView(rec) });
}

// ------------------------------------------------------------------------------------------------ views
function memberView(rec: RoomRec, m: MemberRec): MemberView {
  return {
    userId: m.userId,
    name: m.name,
    role: m.role,
    owner: rec.ownerId === m.userId,
    muted: m.muted,
    removed: m.removed,
    joinedAt: m.joinedAt,
    lastSeenAt: m.lastSeenAt,
  };
}

function toView(rec: RoomRec): RoomView {
  const members = Object.values(rec.members)
    .map((m) => memberView(rec, m))
    .sort((a, b) => Number(b.owner) - Number(a.owner) || RANK[b.role] - RANK[a.role] || a.joinedAt - b.joinedAt);
  return { code: rec.code, name: rec.name, ownerId: rec.ownerId, createdAt: rec.createdAt, lockMentorSeats: rec.lockMentorSeats, frozen: rec.frozen, members };
}

export const roomView = (code: string): RoomView | undefined => {
  const r = load().get(code);
  return r ? toView(r) : undefined;
};
export const isRegistered = (code: string): boolean => load().has(code);
export const memberOf = (code: string, userId: string): MemberView | undefined => {
  const r = load().get(code);
  const m = r?.members[userId];
  return r && m ? memberView(r, m) : undefined;
};

export function roomsFor(userId: string): RoomSummary[] {
  const out: RoomSummary[] = [];
  for (const r of load().values()) {
    const m = r.members[userId];
    if (!m || m.removed) continue;
    out.push({ code: r.code, name: r.name, role: m.role, owner: r.ownerId === userId, lastActiveAt: r.lastActiveAt, memberCount: Object.values(r.members).filter((x) => !x.removed).length });
  }
  return out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

// ------------------------------------------------------------------------------------------------- join
export type JoinResult =
  | { ok: true; room: RoomView; me: MemberView; created: boolean; downgraded?: { from: Role; reason: string } }
  | { ok: false; error: 'removed' | 'full' };

export function joinRoom(code: string, user: { userId: string; name: string }, requested: Role): JoinResult {
  const all = load();
  let rec = all.get(code);
  const created = !rec;
  const now = Date.now();
  if (!rec) {
    rec = { code, name: code, ownerId: user.userId, createdAt: now, lastActiveAt: now, lockMentorSeats: false, frozen: false, members: {} };
    all.set(code, rec);
    log.info('room created', { code, owner: user.userId });
  }
  let m = rec.members[user.userId];
  if (m?.removed) return { ok: false, error: 'removed' };
  if (!m && Object.keys(rec.members).length >= MAX_MEMBERS) return { ok: false, error: 'full' };

  const isOwner = rec.ownerId === user.userId;
  let role: Role = requested;
  let downgraded: { from: Role; reason: string } | undefined;
  if (m?.byModerator) {
    // A moderator decided this role: the member may ask for less, never more.
    role = RANK[requested] < RANK[m.role] ? requested : m.role;
    if (role !== m.role) m.byModerator = false; // stepped down by choice; it is their own role again
  } else if (requested === 'mentor' && !isOwner && rec.lockMentorSeats && m?.role !== 'mentor') {
    role = 'student';
    downgraded = { from: 'mentor', reason: 'The owner locked the mentor seats, so you joined as a student. Ask the owner to promote you.' };
  }

  if (!m) {
    m = { userId: user.userId, name: user.name, role, byModerator: false, muted: false, removed: false, joinedAt: now, lastSeenAt: now };
    rec.members[user.userId] = m;
  } else {
    m.name = user.name;
    m.role = role;
    m.lastSeenAt = now;
  }
  rec.lastActiveAt = now;
  publish(rec);
  return { ok: true, room: toView(rec), me: memberView(rec, m), created, downgraded };
}

export function touch(code: string, userId: string): void {
  const r = load().get(code);
  const m = r?.members[userId];
  if (!r || !m) return;
  const now = Date.now();
  m.lastSeenAt = now;
  r.lastActiveAt = now;
  scheduleSave(); // no broadcast: lastSeen is not worth an event per heartbeat
}

// ---------------------------------------------------------------------------------------------- rules
/** May this person change the document right now? Unregistered (legacy) rooms stay open. */
export function canWrite(code: string, userId: string | undefined): boolean {
  const r = load().get(code);
  if (!r) return true;
  const m = userId ? r.members[userId] : undefined;
  if (!m || m.removed || m.muted) return false;
  if (m.role === 'viewer') return false;
  if (r.frozen && m.role === 'student' && r.ownerId !== m.userId) return false;
  return true;
}

export const isModerator = (code: string, userId: string): boolean => {
  const r = load().get(code);
  const m = r?.members[userId];
  return Boolean(r && m && !m.removed && (r.ownerId === userId || m.role === 'mentor'));
};
export const isOwner = (code: string, userId: string): boolean => load().get(code)?.ownerId === userId;

export type Denied = { ok: false; error: 'forbidden' | 'not_found' | 'invalid'; message: string };
const denied = (error: Denied['error'], message: string): Denied => ({ ok: false, error, message });

export function moderate(
  code: string,
  actorId: string,
  targetId: string,
  patch: { role?: Role; muted?: boolean; removed?: boolean },
): { ok: true; room: RoomView } | Denied {
  const r = load().get(code);
  if (!r) return denied('not_found', 'That room does not exist.');
  if (!isModerator(code, actorId)) return denied('forbidden', 'Only the owner or a mentor can do that.');
  const t = r.members[targetId];
  if (!t) return denied('not_found', 'That person is not in this room.');
  const actorIsOwner = r.ownerId === actorId;
  if (targetId === r.ownerId) return denied('forbidden', 'Nobody can change the room owner.');
  if (!actorIsOwner && (t.role === 'mentor' || patch.role === 'mentor')) return denied('forbidden', 'Only the owner can change or appoint mentors.');
  if (targetId === actorId && (patch.removed || patch.muted)) return denied('invalid', 'You cannot do that to yourself.');

  if (patch.role !== undefined) {
    t.role = patch.role;
    t.byModerator = true;
  }
  if (patch.muted !== undefined) t.muted = patch.muted;
  let removedNow = false;
  if (patch.removed !== undefined) {
    removedNow = patch.removed && !t.removed;
    t.removed = patch.removed;
    if (patch.removed) t.muted = false;
  }
  publish(r);
  if (removedNow) emit({ type: 'member-removed', code, userId: targetId });
  return { ok: true, room: toView(r) };
}

export function updateSettings(
  code: string,
  actorId: string,
  patch: { name?: string; lockMentorSeats?: boolean; frozen?: boolean },
): { ok: true; room: RoomView } | Denied {
  const r = load().get(code);
  if (!r) return denied('not_found', 'That room does not exist.');
  const owner = r.ownerId === actorId;
  if ((patch.name !== undefined || patch.lockMentorSeats !== undefined) && !owner) return denied('forbidden', 'Only the owner can change the name or lock mentor seats.');
  if (patch.frozen !== undefined && !isModerator(code, actorId)) return denied('forbidden', 'Only the owner or a mentor can freeze editing.');
  if (patch.name !== undefined) {
    const name = patch.name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return denied('invalid', 'Give the room a name.');
    r.name = name;
  }
  if (patch.lockMentorSeats !== undefined) r.lockMentorSeats = patch.lockMentorSeats;
  if (patch.frozen !== undefined) r.frozen = patch.frozen;
  publish(r);
  return { ok: true, room: toView(r) };
}

export function deleteRoom(code: string, actorId: string): { ok: true } | Denied {
  const r = load().get(code);
  if (!r) return denied('not_found', 'That room does not exist.');
  if (r.ownerId !== actorId) return denied('forbidden', 'Only the owner can delete the room.');
  load().delete(code);
  flushRoomStore();
  log.info('room deleted', { code, by: actorId });
  emit({ type: 'deleted', code });
  return { ok: true };
}
