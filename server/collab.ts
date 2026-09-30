/**
 * Lane A (Akshit): Yjs collaboration server. Owner: Lane A.
 *
 * Our own minimal Yjs sync + awareness server on stable yjs 13 (NOT @y/websocket-server, which needs Yjs 14).
 * Speaks the same wire protocol as the y-websocket client used in the browser:
 *   ws://host/collab/<roomCode>   message 0 = sync, message 1 = awareness.
 *
 * One Y.Doc per room, kept in memory for the life of the process so a page refresh keeps the code.
 * The Y.Text called 'code' is the shared file. The server seeds the starter program once, when the room is
 * created, so two clients joining together never insert it twice.
 * P-A5: every room is also saved to server/data/rooms/<code>.ydoc (debounced, atomic, flushed on shutdown) and
 * reloaded when the room is first opened, so a server restart (tsx watch restarts on every file save!) keeps the code.
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

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export const STARTER = `def average(nums):
    total = 0
    for i in range(len(nums) + 1):
        total += nums[i]
    return total / len(nums)


print(average([3, 4, 5]))
`;

const DATA_DIR = process.env.COLLAB_DATA_DIR ?? path.resolve(__dirname, 'data', 'rooms');
const SAVE_DEBOUNCE_MS = 800;

class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  /** connection -> awareness client ids it controls (so we can remove them when it drops) */
  readonly conns = new Map<WebSocket, Set<number>>();
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(readonly code: string) {
    this.file = path.join(DATA_DIR, `${code}.ydoc`);
    this.awareness.setLocalState(null); // the server itself is not a participant

    let loaded = false;
    try {
      Y.applyUpdate(this.doc, new Uint8Array(fs.readFileSync(this.file)));
      loaded = true;
    } catch {
      /* no saved copy (or unreadable): start fresh */
    }
    if (!loaded) this.doc.getText('code').insert(0, STARTER);

    this.doc.on('update', () => this.scheduleSave());
    if (!loaded) this.scheduleSave();

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
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, Y.encodeStateAsUpdate(this.doc));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[collab] could not save room ${this.code}`, err);
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

function getRoom(code: string): Room {
  let room = rooms.get(code);
  if (!room) {
    room = new Room(code);
    rooms.set(code, room);
  }
  return room;
}

function connect(conn: WebSocket, room: Room): void {
  conn.binaryType = 'arraybuffer';
  room.conns.set(conn, new Set());

  conn.on('message', (data: ArrayBuffer | Buffer) => {
    try {
      const message = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Buffer));
      const decoder = decoding.createDecoder(message);
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, enc, room.doc, conn);
        if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc)); // reply (sync step 2) only if there is one
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
      }
    } catch (err) {
      console.error('[collab] bad message', err);
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
    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlled), null);
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
  rooms.forEach((r) => r.save());
}

export function attachCollab(server: Server): void {
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      flushAll();
      process.exit(0);
    });
  }
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const code = roomCodeFrom(req.url);
    if (!code) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws, getRoom(code)));
  });
}

/** For /api/health and debugging. */
export function collabStats(): { rooms: number; connections: number } {
  let connections = 0;
  rooms.forEach((r) => (connections += r.conns.size));
  return { rooms: rooms.size, connections };
}

/** Current text of a room's shared file, or undefined if the room does not exist. Handy for server-side features. */
export function getRoomText(code: string): string | undefined {
  return rooms.get(code)?.doc.getText('code').toString();
}
