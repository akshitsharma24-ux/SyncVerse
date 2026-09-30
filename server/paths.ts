/**
 * Where the server keeps its files. Owner: Lane A.
 *   rooms (Yjs docs, version history):  COLLAB_DATA_DIR or server/data/rooms
 *   accounts, room registry, secret, logs: SYNCVERSE_DATA_DIR, else <COLLAB_DATA_DIR>/_meta, else server/data
 * The middle rule means every test that starts a throw-away server with its own COLLAB_DATA_DIR is fully isolated from your
 * real accounts and rooms without any extra setting.
 */
import path from 'node:path';

export function roomsDir(): string {
  return process.env.COLLAB_DATA_DIR || path.resolve(__dirname, 'data', 'rooms');
}

export function dataDir(): string {
  if (process.env.SYNCVERSE_DATA_DIR) return path.resolve(process.env.SYNCVERSE_DATA_DIR);
  if (process.env.COLLAB_DATA_DIR) return path.join(path.resolve(process.env.COLLAB_DATA_DIR), '_meta');
  return path.resolve(__dirname, 'data');
}
