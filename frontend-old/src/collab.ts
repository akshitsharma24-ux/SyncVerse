/**
 * The room's live Yjs document and awareness, for panels that share the editor's connection (the whiteboard).
 * Owner: Lane A. The editor creates them and calls setCollab(); everyone else only calls useCollab(), which is null until
 * the editor has connected and again after it unmounts. One room = one document = one connection: a second
 * WebSocket per panel would double the traffic and the reconnect handling.
 */
import { useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';

export interface Collab {
  doc: Y.Doc;
  awareness: WebsocketProvider['awareness'];
}

let current: Collab | null = null;
const listeners = new Set<() => void>();

/** Lane A's editor only. Pass null BEFORE destroying the document. */
export function setCollab(next: Collab | null): void {
  current = next;
  listeners.forEach((l) => l());
}

export function useCollab(): Collab | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
