/**
 * Lane A (Akshit): the shared editor. Monaco bound to one Yjs document per room (Y.Text 'code') over
 * ws://<host>/collab/<roomCode>. Implements EditorHandle (other lanes only ever see that interface) and feeds
 * usePresence() from Yjs awareness, including labelled remote cursors.
 */
import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import type { EditorHandle, PresenceUser, Role } from '@syncverse/shared';
import { usePresence, usePresenceSetter, useEditorRegistry, useSessionUser } from '../session';
import { monaco } from './monaco-setup';

type Status = 'connecting' | 'connected' | 'disconnected';

const TYPING_MS = 2000; // "typing" for 2 s after the last keystroke
const IDLE_MS = 30000; // "idle" after 30 s without input

interface AwarenessState {
  user?: { userId: string; name: string; color: string; role: Role };
  typingAt?: number;
  activeAt?: number;
}

function collabUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/collab`;
}

const cssString = (s: string) => s.replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ');
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1565a8');

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

export function EditorPanel() {
  const me = useSessionUser();
  const register = useEditorRegistry();
  const setPresence = usePresenceSetter();
  const people = usePresence();
  const cleanupRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [synced, setSynced] = useState(false);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      register(null);
      setPresence([]);
    },
    [register, setPresence],
  );

  const onMount: OnMount = (editor) => {
    const model = editor.getModel();
    if (!model) return;
    // Yjs text uses '\n'. On Windows Monaco defaults to CRLF, which shifts every offset by one per line and corrupts
    // deletes / concurrent edits. Force LF BEFORE binding. (Found by the two-browser test.)
    model.setEOL(monaco.editor.EndOfLineSequence.LF);

    const doc = new Y.Doc();
    const text = doc.getText('code');
    const provider = new WebsocketProvider(collabUrl(), me.roomCode, doc);
    const awareness = provider.awareness;
    awareness.setLocalStateField('user', { userId: me.userId, name: me.name, color: me.color, role: me.role });
    awareness.setLocalStateField('activeAt', Date.now());
    provider.on('status', (e: { status: Status }) => setStatus(e.status));
    provider.on('sync', (isSynced: boolean) => setSynced(isSynced));
    const binding = new MonacoBinding(text, model, new Set([editor]), awareness);

    // ---- presence + remote cursor styling -------------------------------------------------------------------
    const styleEl = document.createElement('style');
    styleEl.dataset.svRemoteCursors = 'true';
    document.head.appendChild(styleEl);
    let lastPublished = '';
    const recompute = () => {
      const now = Date.now();
      let css = '';
      const byUser = new Map<string, PresenceUser>();
      (awareness.getStates() as Map<number, AwarenessState>).forEach((st, clientId) => {
        const u = st.user;
        if (!u) return;
        if (clientId !== doc.clientID) css += cursorCss(clientId, u.name, u.color);
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
    };
    awareness.on('change', recompute);
    const tick = setInterval(recompute, 1000);
    recompute();

    // Only LOCAL input counts as activity (remote edits also fire content-change events, so we use key/mouse events).
    let lastTyping = 0;
    let lastActive = 0;
    const markActive = (typing: boolean) => {
      const now = Date.now();
      if (typing && now - lastTyping > 500) {
        lastTyping = now;
        awareness.setLocalStateField('typingAt', now);
      }
      if (typing || now - lastActive > 1500) {
        lastActive = now;
        awareness.setLocalStateField('activeAt', now);
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

    // ---- EditorHandle -----------------------------------------------------------------------------------------
    const decorations = editor.createDecorationsCollection();
    const handle: EditorHandle = {
      getValue: () => editor.getValue(),
      // ONE Yjs transaction: every collaborator receives a single update and never sees a half-replaced document.
      replaceAll: (next) => {
        doc.transact(() => {
          text.delete(0, text.length);
          text.insert(0, next);
        });
      },
      setMarkers: (markers) => {
        monaco.editor.setModelMarkers(
          model,
          'syncverse',
          markers.map((m) => ({
            startLineNumber: m.line,
            endLineNumber: m.line,
            startColumn: 1,
            endColumn: model.getLineMaxColumn(Math.min(Math.max(m.line, 1), model.getLineCount())),
            message: m.message,
            severity:
              m.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : m.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
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
    if (import.meta.env.DEV) (window as unknown as { __sv?: { editor: EditorHandle } }).__sv = { editor: handle };

    cleanupRef.current = () => {
      clearInterval(tick);
      awareness.off('change', recompute);
      keyDisposable.dispose();
      mouseDisposable.dispose();
      styleEl.remove();
      binding.destroy();
      provider.destroy();
      doc.destroy();
    };
  };

  const dot = status === 'connected' ? '#2e8b5e' : status === 'connecting' ? '#b7791f' : '#c0392b';
  const label = status === 'connected' ? (synced ? 'live' : 'syncing') : status === 'connecting' ? 'connecting' : 'offline - your edits are kept and will merge';

  return (
    <div className="flex h-full flex-col">
      <div className="panel-head" data-testid="editor-status">
        <span className="mono" style={{ color: 'var(--ink)', fontWeight: 500 }}>main.py</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
          {label}
        </span>
        <span style={{ display: 'flex', minWidth: 0, flex: 1, alignItems: 'center', gap: 12, overflow: 'hidden' }} data-testid="presence-strip">
          {people.map((p) => (
            <span
              key={p.userId}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', opacity: p.state === 'idle' ? 0.45 : 1, color: 'var(--ink)' }}
              title={`${p.name} (${p.role}) - ${p.state}`}
              data-presence={`${p.name}:${p.state}`}
            >
              <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
              {p.name}
              {p.userId === me.userId ? ' (you)' : ''}
              {p.state === 'typing' && <i style={{ color: 'var(--muted)' }}>typing...</i>}
              {p.state === 'idle' && <i style={{ color: 'var(--muted)' }}>idle</i>}
            </span>
          ))}
        </span>
        <span className="eyebrow" style={{ fontSize: 10 }}>Python</span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="python"
          defaultValue=""
          theme="syncverse"
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            fontFamily: "'Geist Mono Variable', ui-monospace, Consolas, monospace",
            fontSize: 13.5,
            lineHeight: 22,
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderLineHighlight: 'line',
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on',
          }}
        />
      </div>
    </div>
  );
}

export default EditorPanel;
