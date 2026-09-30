/**
 * Lane A (Akshit): the shared editor. One Monaco editor, one Yjs document per room (see shared/files.ts): a map of files plus
 * one Y.Text per file, synced over ws://<host>/collab/<roomCode>. Implements EditorHandle (other lanes only ever see that
 * interface, and it always means "the file that is open right now") and feeds usePresence() from Yjs awareness, including
 * labelled remote cursors. Who may edit comes from the room (useRoom): viewers, paused people and, while the room is frozen,
 * students get a read-only editor; the server refuses their changes as well.
 */
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import {
  FILES_MAP,
  LANGUAGE_BY_ID,
  MAIN_FILE_ID,
  MAX_FILES,
  MAX_FILE_BYTES,
  detectLanguage,
  isLanguageId,
  languageFromName,
  newFileId,
  textKey,
  uniqueFileName,
  validateFileName,
  type EditorHandle,
  type FileEntry,
  type FileMeta,
  type PresenceUser,
  type Role,
} from '@syncverse/shared';
import { identityParams } from '../api';
import { setCollab } from '../collab';
import { useLowBandwidth } from '../lowbandwidth';
import { useRoom } from '../room';
import { useActiveFileSetter, useEditorRegistry, usePresence, usePresenceSetter, useSessionUser } from '../session';
import { Icon } from '../shell/icons';
import { useToast } from '../shell/toast';
import { useTheme } from '../theme';
import { FileTabs, type Others } from './FileTabs';
import { monaco } from './monaco-setup';

type Status = 'connecting' | 'connected' | 'disconnected';
type Model = monaco.editor.ITextModel;

const TYPING_MS = 2000; // "typing" for 2 s after the last keystroke
const IDLE_MS = 30000; // "idle" after 30 s without input
const LOW_BW_CURSOR_MS = 700;

interface AwarenessState {
  user?: { userId: string; name: string; color: string; role: Role };
  typingAt?: number;
  activeAt?: number;
  file?: string;
}

interface FileOps {
  select: (id: string) => void;
  create: (name: string, language?: string) => string | null;
  rename: (id: string, name: string) => string | null;
  remove: (id: string) => string | null;
  setLanguage: (id: string, language: string) => void;
  download: (id: string) => void;
  upload: (files: File[]) => Promise<{ added: number; problems: string[] }>;
}

function collabUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/collab`;
}

const cssString = (s: string) => s.replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ');
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1565a8');
const themeName = (dark: boolean) => (dark ? 'syncverse-dark' : 'syncverse');

/** y-monaco tags remote selections/cursors with yRemoteSelection-<clientId> / yRemoteSelectionHead-<clientId>; we style them. */
function cursorCss(clientId: number, name: string, colorIn: string): string {
  const color = safeColor(colorIn);
  return `
.yRemoteSelection-${clientId} { background-color: ${color}40; }
.yRemoteSelectionHead-${clientId} { position: absolute; border-left: 2px solid ${color}; height: 100%; box-sizing: border-box; }
.yRemoteSelectionHead-${clientId}::before {
  content: "${cssString(name)}"; position: absolute; top: -17px; left: -2px; padding: 1px 5px; border-radius: 3px 3px 3px 0;
  background: ${color}; color: #fff; font: 600 10px/14px 'Segoe UI', sans-serif; white-space: nowrap; z-index: 10; pointer-events: none;
}`;
}

function sortedFiles(meta: Y.Map<FileMeta>): FileEntry[] {
  return [...meta.entries()].map(([id, m]) => ({ id, ...m })).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function EditorPanel() {
  const me = useSessionUser();
  const room = useRoom();
  const toast = useToast();
  const register = useEditorRegistry();
  const setPresence = usePresenceSetter();
  const setActiveFile = useActiveFileSetter();
  const people = usePresence();
  const theme = useTheme();
  const lowBw = useLowBandwidth();

  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const opsRef = useRef<FileOps | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const canEditRef = useRef(room.canEdit);
  canEditRef.current = room.canEdit;
  const lowRef = useRef(lowBw);
  lowRef.current = lowBw;
  const meRef = useRef(me);
  meRef.current = me;

  const [status, setStatus] = useState<Status>('connecting');
  const [synced, setSynced] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeId, setActiveId] = useState(MAIN_FILE_ID);
  const [others, setOthers] = useState<Record<string, Others[]>>({});

  // ---- build the editor, the document and the connection once -----------------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    monaco.editor.setTheme(themeName(document.documentElement.dataset.theme === 'dark'));
    const editor = monaco.editor.create(host, {
      model: null,
      minimap: { enabled: false },
      fontFamily: "'Geist Mono Variable', ui-monospace, Consolas, monospace",
      fontSize: 13.5,
      lineHeight: 22,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      renderLineHighlight: 'line',
      ariaLabel: 'Shared code editor',
      // Completion like VS Code: type a prefix (Java: sout) and press Tab while the list is open. Enter stays a plain new line,
      // so finishing a word and pressing Enter never inserts a snippet by accident.
      snippetSuggestions: 'top',
      acceptSuggestionOnEnter: 'off',
      quickSuggestions: { other: true, comments: false, strings: false },
      readOnly: !canEditRef.current,
      // Respect "reduce motion": no animated scrolling or caret glide.
      smoothScrolling: !reduceMotion,
      cursorSmoothCaretAnimation: reduceMotion ? 'off' : 'on',
    });
    editorRef.current = editor;

    const doc = new Y.Doc();
    const meta = doc.getMap<FileMeta>(FILES_MAP);
    const provider = new WebsocketProvider(collabUrl(), me.roomCode, doc, { params: identityParams() });
    providerRef.current = provider;
    const awareness = provider.awareness;
    setCollab({ doc, awareness }); // the whiteboard draws into this same document and connection

    // Low-bandwidth mode: send my cursor position at most every 0.7 s instead of on every key press.
    const setField = awareness.setLocalStateField.bind(awareness);
    let pendingSelection: unknown = null;
    let selectionTimer: number | null = null;
    awareness.setLocalStateField = (field: string, value: unknown) => {
      if (field !== 'selection' || !lowRef.current) return setField(field, value);
      pendingSelection = value;
      if (selectionTimer !== null) return;
      selectionTimer = window.setTimeout(() => {
        selectionTimer = null;
        setField('selection', pendingSelection);
      }, LOW_BW_CURSOR_MS);
    };

    const m0 = meRef.current;
    setField('user', { userId: m0.userId, name: m0.name, color: m0.color, role: m0.role });
    setField('activeAt', Date.now());
    provider.on('status', (e: { status: Status }) => setStatus(e.status));
    provider.on('sync', (isSynced: boolean) => setSynced(isSynced));

    // ---- files: one Monaco model + one Yjs binding per file -------------------------------------------------------------
    const entries = new Map<string, { model: Model; binding: MonacoBinding; language: string }>();
    let active: string | null = null;
    let lastList: FileEntry[] = [];
    const decorations = editor.createDecorationsCollection();

    const ensureModel = (id: string, m: FileMeta) => {
      const have = entries.get(id);
      if (have) {
        if (have.language !== m.language) {
          monaco.editor.setModelLanguage(have.model, m.language);
          have.language = m.language;
        }
        return;
      }
      const model = monaco.editor.createModel('', m.language, monaco.Uri.parse(`inmemory://sv/${me.roomCode}/${id}`));
      // Yjs text uses '\n'. On Windows Monaco defaults to CRLF, which shifts every offset by one per line and corrupts
      // deletes / concurrent edits. Force LF BEFORE binding. (Found by the two-browser test.)
      model.setEOL(monaco.editor.EndOfLineSequence.LF);
      const binding = new MonacoBinding(doc.getText(textKey(id)), model, new Set([editor]), awareness);
      entries.set(id, { model, binding, language: m.language });
    };

    const publishSelection = () => {
      const e = active ? entries.get(active) : undefined;
      const sel = editor.getSelection();
      if (!e || !sel || editor.getModel() !== e.model) return;
      const text = doc.getText(textKey(active!));
      let anchor = e.model.getOffsetAt(sel.getStartPosition());
      let head = e.model.getOffsetAt(sel.getEndPosition());
      if (sel.getDirection() === monaco.SelectionDirection.RTL) [anchor, head] = [head, anchor];
      setField('selection', { anchor: Y.createRelativePositionFromTypeIndex(text, anchor), head: Y.createRelativePositionFromTypeIndex(text, head) });
    };

    const select = (id: string) => {
      const e = entries.get(id);
      const m = meta.get(id);
      if (!e || !m) return;
      active = id;
      if (editor.getModel() !== e.model) {
        editor.setModel(e.model);
        decorations.clear();
      }
      setField('file', id);
      publishSelection(); // so others see my cursor in this file straight away
      setActiveFile({ id, name: m.name, language: m.language });
      setActiveId(id);
    };

    const syncFiles = () => {
      const list = sortedFiles(meta);
      const ids = new Set(list.map((f) => f.id));
      const gone = active && !ids.has(active) ? lastList.findIndex((f) => f.id === active) : -1;
      for (const [id, e] of entries) {
        if (ids.has(id)) continue;
        if (editor.getModel() === e.model) editor.setModel(null);
        e.model.dispose(); // y-monaco's binding destroys itself when its model is disposed
        entries.delete(id);
      }
      for (const f of list) ensureModel(f.id, f);
      lastList = list;
      setFiles(list);
      if (!list.length) {
        active = null;
        setActiveFile(null);
        return;
      }
      if (!active || !ids.has(active)) select((gone >= 0 ? list[Math.min(gone, list.length - 1)] : list.find((f) => f.id === MAIN_FILE_ID) ?? list[0]).id);
      else {
        const m = meta.get(active)!;
        setActiveFile({ id: active, name: m.name, language: m.language });
      }
    };
    // Build models AFTER the transaction that changed the file map has finished. Yjs calls the file-map observer before the
    // observer of a new file's text in the same transaction, so a binding created inside it would receive that text twice
    // (once from the initial value, once from the pending insert event): new files would show their starter code doubled.
    const onFilesChanged = () => queueMicrotask(syncFiles);
    meta.observe(onFilesChanged);
    syncFiles();

    const taken = (except?: string) => sortedFiles(meta).filter((f) => f.id !== except).map((f) => f.name);
    const nextOrder = () => Math.max(-1, ...sortedFiles(meta).map((f) => f.order)) + 1;
    const add = (name: string, language: string, content: string) => {
      const id = newFileId();
      doc.transact(() => {
        meta.set(id, { name, language, order: nextOrder(), createdAt: Date.now() });
        if (content) doc.getText(textKey(id)).insert(0, content);
      });
      syncFiles(); // the new file's model must exist now so the caller can open it (the deferred call later does nothing)
      return id;
    };
    const locked = () => (canEditRef.current ? null : 'You cannot change files right now.');

    const ops: FileOps = {
      select,
      create: (name, language) => {
        const n = name.trim();
        const err = locked() ?? (meta.size >= MAX_FILES ? `A room can have at most ${MAX_FILES} files.` : validateFileName(n, taken()));
        if (err) return err;
        const lang = language && isLanguageId(language) ? language : detectLanguage(n);
        select(add(n, lang, LANGUAGE_BY_ID[lang]?.starter ?? ''));
        return null;
      },
      rename: (id, name) => {
        const f = meta.get(id);
        const n = name.trim();
        const err = locked() ?? (!f ? 'That file no longer exists.' : validateFileName(n, taken(id)));
        if (err || !f) return err;
        if (n !== f.name) meta.set(id, { ...f, name: n, language: languageFromName(n) ?? f.language });
        return null;
      },
      remove: (id) => {
        const err = locked() ?? (meta.size <= 1 ? 'A room needs at least one file.' : !meta.has(id) ? 'That file no longer exists.' : null);
        if (err) return err;
        doc.transact(() => {
          const t = doc.getText(textKey(id));
          t.delete(0, t.length);
          meta.delete(id);
        });
        return null;
      },
      setLanguage: (id, language) => {
        const f = meta.get(id);
        if (f && canEditRef.current && isLanguageId(language) && f.language !== language) meta.set(id, { ...f, language });
      },
      download: (id) => {
        const f = meta.get(id);
        if (!f) return;
        const url = URL.createObjectURL(new Blob([doc.getText(textKey(id)).toString()], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      upload: async (list) => {
        const problems: string[] = [];
        let added = 0;
        let last = '';
        for (const file of list) {
          if (locked()) {
            problems.push('You cannot change files right now.');
            break;
          }
          if (meta.size >= MAX_FILES) {
            problems.push(`Skipped ${file.name}: a room can have at most ${MAX_FILES} files.`);
            continue;
          }
          if (file.size > MAX_FILE_BYTES) {
            problems.push(`Skipped ${file.name}: files can be at most ${Math.round(MAX_FILE_BYTES / 1000)} KB.`);
            continue;
          }
          let text: string;
          try {
            text = (await file.text()).replace(/\r\n?/g, '\n');
          } catch {
            problems.push(`Could not read ${file.name}.`);
            continue;
          }
          if (text.includes('\u0000')) {
            problems.push(`Skipped ${file.name}: it is not a text file.`);
            continue;
          }
          const name = uniqueFileName(file.name, taken());
          last = add(name, detectLanguage(name, text), text);
          added++;
        }
        if (last) select(last);
        return { added, problems };
      },
    };
    opsRef.current = ops;

    // ---- presence + remote cursor styling -------------------------------------------------------------------------------
    const styleEl = document.createElement('style');
    styleEl.dataset.svRemoteCursors = 'true';
    document.head.appendChild(styleEl);
    let lastPublished = '';
    let lastOthers = '';
    const recompute = () => {
      const now = Date.now();
      let css = '';
      const byUser = new Map<string, PresenceUser>();
      const byFile: Record<string, Others[]> = {};
      (awareness.getStates() as Map<number, AwarenessState>).forEach((st, clientId) => {
        const u = st.user;
        if (!u) return;
        if (clientId !== doc.clientID) {
          css += cursorCss(clientId, u.name, u.color);
          const list = (byFile[st.file ?? MAIN_FILE_ID] ??= []);
          if (!list.some((o) => o.userId === u.userId)) list.push({ userId: u.userId, name: u.name, color: u.color });
        }
        const typing = st.typingAt !== undefined && now - st.typingAt < TYPING_MS;
        const idle = !typing && now - (st.activeAt ?? 0) > IDLE_MS;
        byUser.set(u.userId, { userId: u.userId, name: u.name, color: u.color, role: u.role, state: typing ? 'typing' : idle ? 'idle' : 'online' });
      });
      if (styleEl.textContent !== css) styleEl.textContent = css;
      const list = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
      const key = JSON.stringify(list);
      if (key !== lastPublished) {
        lastPublished = key;
        setPresence(list);
      }
      const othersKey = JSON.stringify(byFile);
      if (othersKey !== lastOthers) {
        lastOthers = othersKey;
        setOthers(byFile);
      }
    };
    awareness.on('change', recompute);
    const tick = setInterval(recompute, lowRef.current ? 3000 : 1000);
    recompute();

    // Only LOCAL input counts as activity (remote edits also fire content-change events, so we use key/mouse events).
    let lastTyping = 0;
    let lastActive = 0;
    const markActive = (typing: boolean) => {
      const now = Date.now();
      if (typing && now - lastTyping > 500) {
        lastTyping = now;
        setField('typingAt', now);
      }
      if (typing || now - lastActive > 1500) {
        lastActive = now;
        setField('activeAt', now);
      }
    };
    // Only keys that can change the text count as "typing"; arrows, Shift+End, etc. are just activity.
    const keyDisposable = editor.onKeyDown((e) => {
      const k = e.browserEvent.key;
      const mod = e.ctrlKey || e.metaKey;
      const edits = (k.length === 1 && !mod) || ['Backspace', 'Delete', 'Enter', 'Tab'].includes(k) || (mod && ['v', 'x', 'z', 'y'].includes(k.toLowerCase()));
      markActive(edits);
    });
    const mouseDisposable = editor.onMouseDown(() => markActive(false));

    // ---- EditorHandle ---------------------------------------------------------------------------------------------------
    const current = () => (active ? entries.get(active) : undefined);
    const handle: EditorHandle = {
      getValue: () => current()?.model.getValue() ?? '',
      // ONE Yjs transaction: every collaborator receives a single update and never sees a half-replaced document.
      replaceAll: (next) => {
        if (!active || !canEditRef.current) return;
        const text = doc.getText(textKey(active));
        doc.transact(() => {
          text.delete(0, text.length);
          text.insert(0, next);
        });
      },
      setMarkers: (markers) => {
        const e = current();
        if (!e) return;
        monaco.editor.setModelMarkers(
          e.model,
          'syncverse',
          markers.map((m) => ({
            startLineNumber: m.line,
            endLineNumber: m.line,
            startColumn: 1,
            endColumn: e.model.getLineMaxColumn(Math.min(Math.max(m.line, 1), e.model.getLineCount())),
            message: m.message,
            severity: m.severity === 'error' ? monaco.MarkerSeverity.Error : m.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
          })),
        );
      },
      highlightLine: (line) => {
        decorations.set(line ? [{ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'sv-error-line' } }] : []);
        if (line) editor.revealLineInCenterIfOutsideViewport(line);
      },
    };
    register(handle);
    // Dev-only hook so automated browser tests (and the console) can drive the editor: window.__sv.editor.replaceAll('x')
    if (import.meta.env.DEV) {
      (window as unknown as { __sv?: unknown }).__sv = {
        editor: handle,
        collab: { doc, awareness }, // for tests that write raw data (whiteboard validation, viewer write rules)
        files: { ...ops, list: () => sortedFiles(meta), activeId: () => active, activeLanguage: () => editor.getModel()?.getLanguageId(), readOnly: () => editor.getOption(monaco.editor.EditorOption.readOnly) },
      };
    }

    cleanupRef.current = () => {
      setCollab(null);
      clearInterval(tick);
      if (selectionTimer !== null) clearTimeout(selectionTimer);
      meta.unobserve(onFilesChanged);
      awareness.off('change', recompute);
      keyDisposable.dispose();
      mouseDisposable.dispose();
      styleEl.remove();
      provider.destroy();
      editor.setModel(null);
      entries.forEach((e) => e.model.dispose());
      entries.clear();
      editor.dispose();
      doc.destroy();
    };
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      editorRef.current = null;
      providerRef.current = null;
      opsRef.current = null;
      register(null);
      setPresence([]);
      setActiveFile(null);
    };
    // The editor, the document and the connection live exactly as long as this panel: one room per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- follow the theme, the room's rules, my role and the room's fate --------------------------------------------------
  useEffect(() => {
    monaco.editor.setTheme(themeName(theme === 'dark'));
  }, [theme]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: !room.canEdit, readOnlyMessage: { value: room.readOnlyReason ?? 'Editing is off.' } });
  }, [room.canEdit, room.readOnlyReason]);

  useEffect(() => {
    const awareness = providerRef.current?.awareness;
    const user = awareness?.getLocalState()?.user as AwarenessState['user'];
    if (awareness && user && user.role !== me.role) awareness.setLocalStateField('user', { ...user, role: me.role });
  }, [me.role]);

  useEffect(() => {
    if (room.status === 'removed' || room.status === 'deleted') providerRef.current?.disconnect(); // do not reconnect into a room I am out of
  }, [room.status]);

  async function upload(list: File[]) {
    const r = await opsRef.current?.upload(list);
    if (!r) return;
    if (r.added) toast(`Added ${r.added} file${r.added > 1 ? 's' : ''}.`, 'ok');
    r.problems.slice(0, 3).forEach((p) => toast(p, 'error'));
  }

  const dot = status === 'connected' ? 'var(--ok)' : status === 'connecting' ? 'var(--warn)' : 'var(--danger)';
  const label = status === 'connected' ? (synced ? 'live' : 'syncing') : status === 'connecting' ? 'connecting' : 'offline - your edits are kept and will merge';

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head" data-testid="editor-status">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
          {label}
        </span>
        <span style={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', gap: 12, overflow: 'hidden' }} data-testid="presence-strip">
          {people.map((p) => (
            <span
              key={p.userId}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', color: 'var(--ink)' }}
              title={`${p.name} (${p.role}) - ${p.state}`}
              data-presence={`${p.name}:${p.state}`}
            >
              <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'inline-block', opacity: p.state === 'idle' ? 0.4 : 1 }} />
              {p.name}
              {p.userId === me.userId ? ' (you)' : ''}
              {p.state === 'typing' && <i style={{ color: 'var(--muted)' }}>typing...</i>}
              {p.state === 'idle' && <i style={{ color: 'var(--muted)' }}>idle</i>}
            </span>
          ))}
        </span>
      </div>
      <FileTabs
        files={files}
        activeId={activeId}
        canEdit={room.canEdit}
        others={others}
        onSelect={(id) => opsRef.current?.select(id)}
        onCreate={(name, language) => (opsRef.current ? opsRef.current.create(name, language) : 'The editor is still loading.')}
        onRename={(id, name) => (opsRef.current ? opsRef.current.rename(id, name) : 'The editor is still loading.')}
        onDelete={(id) => (opsRef.current ? opsRef.current.remove(id) : 'The editor is still loading.')}
        onLanguage={(id, language) => opsRef.current?.setLanguage(id, language)}
        onDownload={(id) => opsRef.current?.download(id)}
        onUpload={(list) => void upload(list)}
      />
      {!room.canEdit && room.readOnlyReason && (
        <div role="status" className="readonly-banner" data-testid="readonly-banner">
          <Icon name="lock" size={13} /> {room.readOnlyReason}
        </div>
      )}
      <div
        className="min-h-0 flex-1"
        onDragOver={(e) => {
          if (room.canEdit && e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          const list = [...e.dataTransfer.files];
          if (!room.canEdit || !list.length) return;
          e.preventDefault();
          void upload(list);
        }}
      >
        <div ref={hostRef} style={{ height: '100%' }} data-testid="editor-host" />
      </div>
    </div>
  );
}

export default EditorPanel;
