/**
 * Lane B (Simrit): run logic for the console panel (P-B2). Sends the editor text, follows the run until it finishes,
 * keeps the last five finished runs, and hands every finished run to WorkspaceContext.setLastRun (Lane C/D read it).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunResult } from '@syncverse/shared';
import { api, ApiError } from '../api';
import { useEditor, useSessionUser, useWorkspace } from '../session';
import { clearRunMarkers, markRunError } from './markers';

export interface RunInfo {
  runner: 'judge0' | 'local';
  sandboxed: boolean;
  languages: string[];
}

export const isDone = (r: RunResult) => r.status !== 'queued' && r.status !== 'running';

const POLL_MS = 400;
const GIVE_UP_MS = 45_000;
const HISTORY = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A human sentence for a failed API call. */
export function apiMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { error?: unknown } | null;
    if (b && typeof b === 'object' && typeof b.error === 'string') return b.error;
    if (e.status === 401) return 'Your session is missing. Rejoin the room and try again.';
    if (e.status === 501) return 'The run service is not available yet.';
    return `The server answered with an error (HTTP ${e.status}).`;
  }
  return 'Could not reach the server. Check your connection and try again.';
}

export function useRunner() {
  const editor = useEditor();
  const me = useSessionUser();
  const { setLastRun } = useWorkspace();
  const [runs, setRuns] = useState<RunResult[]>([]); // finished runs, newest first
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<RunInfo | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; // stops any polling loop
      clearRunMarkers(editor);
    };
  }, [editor]);

  const finish = useCallback(
    (r: RunResult, mark = true) => {
      setRuns((prev) => [r, ...prev.filter((x) => x.id !== r.id)].slice(0, HISTORY));
      setSelectedId(r.id);
      setLastRun(r);
      if (mark) markRunError(editor, r); // error line marker + highlight (or clears them)
    },
    [setLastRun, editor],
  );

  /** After a page refresh the editor text arrives a moment later; mark the line only once it is there. */
  const markWhenEditorReady = useCallback(
    async (r: RunResult) => {
      for (let i = 0; i < 30 && alive.current && !editor.getValue(); i++) await sleep(200);
      if (alive.current && !busyRef.current) markRunError(editor, r);
    },
    [editor],
  );

  /** Polls one run until it finishes. Returns when done, gone, or given up (with a notice). */
  const follow = useCallback(
    async (id: string) => {
      const t0 = Date.now();
      let fails = 0;
      while (alive.current) {
        await sleep(POLL_MS);
        if (!alive.current) return;
        try {
          const r = await api.get<RunResult>('/api/run/' + id);
          fails = 0;
          if (isDone(r)) {
            finish(r);
            return;
          }
        } catch (e) {
          if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
            setNotice('That run is no longer available (the server may have restarted). Run again.');
            return;
          }
          if (++fails >= 5) {
            setNotice('Lost the connection to the server. Check your network and run again.');
            return;
          }
        }
        if (Date.now() - t0 > GIVE_UP_MS) {
          setNotice('The run is taking too long. Try again.');
          return;
        }
      }
    },
    [finish],
  );

  const run = useCallback(
    async (stdin: string) => {
      if (busyRef.current) return;
      const source = editor.getValue();
      if (!source.trim()) {
        setNotice('There is no code to run.');
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setNotice(null);
      try {
        const { id } = await api.post<{ id: string }>('/api/run', { roomCode: me.roomCode, language: 'python', source, stdin });
        clearRunMarkers(editor); // the server accepted a new run: the old error marker is out of date
        await follow(id);
      } catch (e) {
        if (alive.current) setNotice(apiMessage(e));
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [editor, me.roomCode, follow],
  );

  // On load: which runner is in use, and pick up this person's latest run (page refresh, even mid-run).
  useEffect(() => {
    api
      .get<RunInfo>('/api/run-info')
      .then((i) => alive.current && setInfo(i))
      .catch(() => undefined);
    api
      .get<RunResult | null>('/api/runs/latest')
      .then(async (r) => {
        if (!r || !alive.current || busyRef.current) return;
        if (isDone(r)) {
          finish(r, false);
          void markWhenEditorReady(r);
          return;
        }
        busyRef.current = true;
        setBusy(true);
        try {
          await follow(r.id);
        } finally {
          busyRef.current = false;
          if (alive.current) setBusy(false);
        }
      })
      .catch(() => undefined);
  }, [finish, follow, markWhenEditorReady]);

  return { runs, selectedId, setSelectedId, busy, notice, info, run };
}
