/**
 * Lane A (Akshit): Yjs collaboration server. Owner: Lane A.
 *
 * Our own minimal Yjs sync + awareness server on stable yjs 13 (NOT @y/websocket-server, which needs Yjs 14).
 * Speaks the same wire protocol as the y-websocket client used in the browser:
 *   ws://host/collab/<roomCode>[?token=<account token> | ?uid=<guest id>]   message 0 = sync, message 1 = awareness.
 *
 * One Y.Doc per room, kept in memory for the life of the process so a page refresh keeps the code.
 * Files: Y.Map 'files' (fileId -> name, language, order) plus one Y.Text per file ('code' for the first file, 'f:<id>' for
 * the rest). See shared/files.ts. The server seeds main.py with the starter program once, when the room is created.
 * P-A5: every room is also saved to server/data/rooms/<code>.ydoc (debounced, atomic, flushed on shutdown).
 *
 * Who may write: rooms registered in the room registry (server/roomstore.ts) only accept members, and drop document changes
 * from viewers, paused (muted) members, and students while the room is frozen. They can still watch and show a cursor.
 * Rooms nobody registered (a raw script connection) stay open, as before.
 * Versions: saved copies of all files (server/versions.ts), taken by hand, every 5 minutes while people are editing, and when
 * the last person leaves.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { DEFAULT_PROGRAM, FILES_MAP, MAIN_FILE_ID, textKey, type FileEntry, type FileMeta, type SnapshotFile, type VersionInfo } from '@syncverse/shared';
import { accountFromToken, isAccountId } from './auth';
import { accountsRequired } from './env';
import { logger } from './logger';
import { roomsDir } from './paths';
import { addVersion, deleteVersions, getVersion } from './versions';
import { canWrite, flushRoomStore, isRegistered, memberOf, onRoomEvent, touch } from './roomstore';

const log = logger('collab');

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export const STARTER = DEFAULT_PROGRAM;

const SAVE_DEBOUNCE_MS = 800;
const AUTO_VERSION_MS = () => Number(process.env.VERSION_AUTO_MS) || 5 * 60_000;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

const mainMeta = (): FileMeta => ({ name: 'main.py', language: 'python', order: 0, createdAt: Date.now() });

class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  /** connection -> awareness client ids it controls (so we can remove them when it drops) */
  readonly conns = new Map<WebSocket, Set<number>>();
  /** connection -> who it belongs to (undefined for anonymous connections to legacy rooms) */
  readonly users = new Map<WebSocket, string | undefined>();
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private versionTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private destroyed = false;

  constructor(readonly code: string) {
    this.file = path.join(roomsDir(), `${code}.ydoc`);
    this.awareness.setLocalState(null); // the server itself is not a participant

    let loaded = false;
    try {
      Y.applyUpdate(this.doc, new Uint8Array(fs.readFileSync(this.file)));
      loaded = true;
    } catch {
      /* no saved copy (or unreadable): start fresh */
    }
    const meta = this.doc.getMap<FileMeta>(FILES_MAP);
    let seeded = false;
    if (!loaded) {
      this.doc.getText('code').insert(0, STARTER);
      seeded = true;
    }
    if (meta.size === 0) {
      meta.set(MAIN_FILE_ID, mainMeta()); // new room, or a room saved before multi-file existed
      seeded = true;
    }
    // A room can never end up with no file at all (two people deleting the last two files at once).
    meta.observe(() => {
      if (meta.size === 0) this.doc.transact(() => meta.set(MAIN_FILE_ID, mainMeta()), 'server');
    });

    this.doc.on('update', () => {
      this.dirty = true;
      this.scheduleSave();
    });
    if (seeded) this.scheduleSave();

    this.doc.on('update', (update: Uint8Array) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.broadcast(encoding.toUint8Array(enc));
    });

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin instanceof WebSocket) {
          const controlled = this.conns.get(origin);
          if (controlled) {
            added.forEach((id) => controlled.add(id));
            removed.forEach((id) => controlled.delete(id));
          }
        }
        const changed = added.concat(updated, removed);
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_AWARENESS);
        encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
        this.broadcast(encoding.toUint8Array(enc));
      },
    );
  }

  broadcast(message: Uint8Array): void {
    this.conns.forEach((_ids, conn) => send(conn, message));
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS);
  }

  /** Synchronous and atomic (write a temp file, then rename) so a crash never leaves a half-written room. */
  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.destroyed) return;
    try {
      fs.mkdirSync(roomsDir(), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, Y.encodeStateAsUpdate(this.doc));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      log.error('could not save room', { code: this.code, error: err });
    }
  }

  // ---- files and versions ------------------------------------------------------------------------------------
  files(): FileEntry[] {
    const meta = this.doc.getMap<FileMeta>(FILES_MAP);
    return [...meta.entries()].map(([id, m]) => ({ id, ...m })).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  snapshotFiles(): SnapshotFile[] {
    return this.files().map((f) => ({ ...f, content: this.doc.getText(textKey(f.id)).toString() }));
  }

  /** Make the room's files exactly match a saved copy, as ONE transaction (everyone gets a single update). */
  restoreFiles(files: SnapshotFile[]): void {
    const meta = this.doc.getMap<FileMeta>(FILES_MAP);
    this.doc.transact(() => {
      const keep = new Set(files.map((f) => f.id));
      for (const id of [...meta.keys()]) {
        if (keep.has(id)) continue;
        const t = this.doc.getText(textKey(id));
        t.delete(0, t.length);
        meta.delete(id);
      }
      for (const f of files) {
        meta.set(f.id, { name: f.name, language: f.language, order: f.order, createdAt: f.createdAt });
        const t = this.doc.getText(textKey(f.id));
        if (t.toString() !== f.content) {
          t.delete(0, t.length);
          t.insert(0, f.content);
        }
      }
    }, 'restore');
  }

  autoVersion(label: string): void {
    if (!this.dirty) return;
    this.dirty = false;
    const v = addVersion(this.code, { label, auto: true, by: null, files: this.snapshotFiles() });
    if (v) log.debug('autosaved version', { code: this.code, label });
  }

  startVersionTimer(): void {
    if (this.versionTimer) return;
    this.versionTimer = setInterval(() => this.autoVersion('Autosave'), AUTO_VERSION_MS());
    this.versionTimer.unref();
  }

  stopVersionTimer(): void {
    if (this.versionTimer) clearInterval(this.versionTimer);
    this.versionTimer = null;
  }

  discard(): void {
    this.destroyed = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.stopVersionTimer();
  }

  close(code: number, reason: string, only?: (userId: string | undefined) => boolean): void {
    for (const conn of [...this.conns.keys()]) {
      if (!only || only(this.users.get(conn))) conn.close(code, reason);
    }
  }
}

function send(conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState !== WebSocket.OPEN) return;
  conn.send(message, (err) => {
    if (err) conn.close();
  });
}

const rooms = new Map<string, Room>();
const deletedCodes = new Set<string>(); // refuse to resurrect a room that was just deleted (clients auto-reconnect)

function getRoom(code: string): Room {
  let room = rooms.get(code);
  if (!room) {
    room = new Room(code);
    rooms.set(code, room);
  }
  return room;
}

function connect(conn: WebSocket, room: Room, userId: string | undefined): void {
  conn.binaryType = 'arraybuffer';
  room.conns.set(conn, new Set());
  room.users.set(conn, userId);
  room.startVersionTimer();
  if (userId) touch(room.code, userId);

  conn.on('message', (data: ArrayBuffer | Buffer) => {
    try {
      const message = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Buffer));
      const decoder = decoding.createDecoder(message);
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        // sync step 1 only ASKS for state. Step 2 and updates CHANGE the document: those need write permission.
        const syncType = decoding.peekVarUint(decoder);
        if (syncType !== syncProtocol.messageYjsSyncStep1 && !canWrite(room.code, userId)) return;
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, enc, room.doc, conn);
        if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc)); // reply (sync step 2) only if there is one
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
      }
    } catch (err) {
      log.warn('bad message', { code: room.code, error: err });
    }
  });

  // Keep-alive: drop dead sockets (laptop lid closed, Wi-Fi gone) so stale cursors disappear.
  let alive = true;
  const ping = setInterval(() => {
    if (!alive) {
      conn.terminate();
      return;
    }
    alive = false;
    try {
      conn.ping();
    } catch {
      conn.terminate();
    }
  }, 15000);
  conn.on('pong', () => {
    alive = true;
  });

  conn.on('close', () => {
    clearInterval(ping);
    const controlled = room.conns.get(conn);
    room.conns.delete(conn);
    room.users.delete(conn);
    if (userId) touch(room.code, userId);
    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlled), null);
    }
    if (room.conns.size === 0) {
      room.stopVersionTimer();
      room.autoVersion('Session ended');
    }
  });

  // Greet: sync step 1 (asks the client for what we lack) and everyone's current awareness state.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(conn, encoding.toUint8Array(enc));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aenc = encoding.createEncoder();
    encoding.writeVarUint(aenc, MSG_AWARENESS);
    encoding.writeVarUint8Array(aenc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
    send(conn, encoding.toUint8Array(aenc));
  }
}

function roomCodeFrom(url: string | undefined): string | null {
  if (!url) return null;
  const pathname = new URL(url, 'http://localhost').pathname;
  if (!pathname.startsWith('/collab/')) return null;
  const code = decodeURIComponent(pathname.slice('/collab/'.length)).toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(code) ? code : null;
}

/** Save every room right now. Runs on shutdown so the last edits before a restart are not lost. */
function flushAll(): void {
  rooms.forEach((r) => {
    r.save();
    r.autoVersion('Session ended');
  });
  flushRoomStore();
}

function refuse(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/** Decide who is on the other end of an upgrade request: { userId } (maybe undefined = anonymous) or { bad }. */
function whoIs(req: IncomingMessage): { userId?: string; signedIn: boolean; bad?: boolean } {
  const q = new URL(req.url ?? '', 'http://localhost').searchParams;
  const token = q.get('token');
  if (token) {
    const a = accountFromToken(token);
    return a ? { userId: a.id, signedIn: true } : { signedIn: false, bad: true };
  }
  const uid = q.get('uid') ?? undefined;
  if (uid && isAccountId(uid)) return { signedIn: false, bad: true }; // an account id needs its token
  return { userId: uid, signedIn: false };
}

export function attachCollab(server: Server): void {
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      flushAll();
      process.exit(0);
    });
  }
  // A member who is removed loses their connection at once; a deleted room disappears for everyone.
  onRoomEvent((ev) => {
    if (ev.type === 'member-removed') rooms.get(ev.code)?.close(4403, 'removed', (uid) => uid === ev.userId);
    else if (ev.type === 'deleted') destroyRoom(ev.code);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const code = roomCodeFrom(req.url);
    if (!code) {
      socket.destroy();
      return;
    }
    if (deletedCodes.has(code)) {
      if (isRegistered(code)) deletedCodes.delete(code); // the code was registered again: a new room
      else return refuse(socket, 410, 'Gone');
    }
    const who = whoIs(req);
    if (who.bad) return refuse(socket, 401, 'Unauthorized');
    if (accountsRequired() && !who.signedIn) return refuse(socket, 401, 'Unauthorized');
    if (isRegistered(code)) {
      const m = who.userId ? memberOf(code, who.userId) : undefined;
      if (!m || m.removed) {
        log.warn('collab connection refused: not a member', { code, user: who.userId });
        return refuse(socket, 403, 'Forbidden');
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws, getRoom(code), who.userId));
  });
}

// ------------------------------------------------------------------------------------ used by the routes
/** For /api/health and debugging. */
export function collabStats(): { rooms: number; connections: number } {
  let connections = 0;
  rooms.forEach((r) => (connections += r.conns.size));
  return { rooms: rooms.size, connections };
}

/** Current text of a room's main file, or undefined if the room does not exist. Handy for server-side features. */
export function getRoomText(code: string): string | undefined {
  return rooms.get(code)?.doc.getText('code').toString();
}

export const roomFiles = (code: string): SnapshotFile[] => getRoom(code).snapshotFiles();

/** Save a named copy of every file. Returns null only for an autosave where nothing changed. */
export function takeSnapshot(code: string, label: string, by: { userId: string; name: string } | null, auto = false): VersionInfo | null {
  return addVersion(code, { label, auto, by, files: getRoom(code).snapshotFiles() });
}

/** Put a saved copy back (the caller saves a "Before restore" copy first). Returns false if the version is unknown. */
export function restoreSnapshot(code: string, versionId: string): boolean {
  const v = getVersion(code, versionId);
  if (!v) return false;
  getRoom(code).restoreFiles(v.files);
  return true;
}

/** Disconnect one person from a room (they were removed or their access changed). */
export function kickUser(code: string, userId: string): void {
  rooms.get(code)?.close(4403, 'removed', (uid) => uid === userId);
}

/** Forget a room completely: disconnect everyone, delete its saved document and its history. */
export function destroyRoom(code: string): void {
  deletedCodes.add(code);
  const room = rooms.get(code);
  if (room) {
    room.discard();
    room.close(4404, 'deleted');
    room.doc.destroy();
    rooms.delete(code);
  }
  for (const f of [`${code}.ydoc`, `${code}.ydoc.tmp`]) {
    try {
      fs.unlinkSync(path.join(roomsDir(), f));
    } catch {
      /* not there */
    }
  }
  deleteVersions(code);
}
