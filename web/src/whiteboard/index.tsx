/**
 * Lane A (Akshit): the shared whiteboard (the "Board" tab). Everyone in the room draws on the same page at the same time:
 * pen, line, arrow, rectangle, ellipse, text and an eraser, in six colours and three sizes. Shapes live in the room's Yjs
 * document (shared/whiteboard.ts), so they persist with the room and follow the room's write rules: viewers, paused people and,
 * while the room is frozen, students can watch but not draw. A stroke that is still being drawn is shown to others through
 * awareness (skipped in low-bandwidth mode). Undo takes back your own last shape; only a mentor can clear the page.
 * "Expand" makes the same board fill the window (the component stays mounted, so nothing is lost); Esc closes it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BOARD_ARRAY,
  BOARD_COLORS,
  BOARD_H,
  BOARD_SIZES,
  BOARD_W,
  MAX_PEN_NUMBERS,
  MAX_SHAPES,
  MAX_TEXT_CHARS,
  newShapeId,
  sanitizeShape,
  textSize,
  type BoardShape,
  type ShapeTool,
} from '@syncverse/shared';
import { useCollab } from '../collab';
import { useLowBandwidth } from '../lowbandwidth';
import { useRoom } from '../room';
import { useSessionUser } from '../session';
import { Icon } from '../shell/icons';
import { useToast } from '../shell/toast';
import { BOARD_BG, BOARD_FONT, distanceToShape, drawShape, drawTag } from './draw';

type Tool = ShapeTool | 'eraser';

const TOOLS: { id: Tool; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'pen', label: 'Pen', icon: 'pencil' },
  { id: 'line', label: 'Line', icon: 'line' },
  { id: 'arrow', label: 'Arrow', icon: 'arrowline' },
  { id: 'rect', label: 'Rectangle', icon: 'rect' },
  { id: 'ellipse', label: 'Ellipse', icon: 'ellipse' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser' },
];

const MIN_STEP = 2; // board units between pen samples
const ERASE_RADIUS = 14;
const LIVE_MS = 60; // how often an unfinished stroke is sent to others

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const safeColor = (c: unknown) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1565a8');

interface Live {
  shape: BoardShape;
  name: string;
  color: string;
}

export function WhiteboardPanel() {
  const collab = useCollab();
  const me = useSessionUser();
  const room = useRoom();
  const toast = useToast();
  const lowBw = useLowBandwidth();

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(BOARD_COLORS[0].hex);
  const [size, setSize] = useState(BOARD_SIZES[1].size);
  const [expanded, setExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [counts, setCounts] = useState({ total: 0, mine: 0 });
  const [drawing, setDrawing] = useState<string[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const shapesRef = useRef<BoardShape[]>([]);
  const liveRef = useRef(new Map<number, Live>());
  const draftRef = useRef<BoardShape | null>(null);
  const activeRef = useRef(false);
  const textAtRef = useRef(textAt);
  textAtRef.current = textAt;
  const liveTimer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const canEditRef = useRef(room.canEdit);
  canEditRef.current = room.canEdit;

  const canDraw = room.canEdit && collab !== null;

  // ---- painting ---------------------------------------------------------------------------------------------------------
  const paint = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !box.w) return;
    const k = box.w / BOARD_W; // screen pixels per board unit
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    for (const s of shapesRef.current) drawShape(ctx, s);
    liveRef.current.forEach((l) => {
      drawShape(ctx, l.shape, 0.85);
      const n = l.shape.pts.length;
      drawTag(ctx, l.name, l.color, l.shape.pts[n - 2], l.shape.pts[n - 1], k);
    });
    if (draftRef.current) drawShape(ctx, draftRef.current);
  }, [box]);
  drawRef.current = paint;

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      drawRef.current();
    });
  }, []);

  // Keep the canvas as large as the stage allows while keeping the page's 16:9 shape.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(Math.min(el.clientWidth, (el.clientHeight * BOARD_W) / BOARD_H));
      setBox((b) => (b.w === w ? b : { w, h: Math.floor((w * BOARD_H) / BOARD_W) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || !box.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(box.w * dpr);
    c.height = Math.round(box.h * dpr);
    paint();
  }, [box, paint]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (liveTimer.current !== null) clearTimeout(liveTimer.current);
    },
    [],
  );

  // ---- the shared data ----------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!collab) {
      shapesRef.current = [];
      liveRef.current.clear();
      setCounts({ total: 0, mine: 0 });
      setDrawing([]);
      schedule();
      return;
    }
    const { doc, awareness } = collab;
    const arr = doc.getArray<unknown>(BOARD_ARRAY);
    const read = () => {
      const list: BoardShape[] = [];
      for (const v of arr.toArray()) {
        const s = sanitizeShape(v);
        if (s) list.push(s);
        if (list.length >= MAX_SHAPES) break;
      }
      shapesRef.current = list;
      setCounts((c) => {
        const mine = list.filter((s) => s.by === me.userId).length;
        return c.total === list.length && c.mine === mine ? c : { total: list.length, mine };
      });
      schedule();
    };
    const readLive = () => {
      const next = new Map<number, Live>();
      (awareness.getStates() as Map<number, { user?: { name?: string; color?: string }; board?: unknown }>).forEach((st, clientId) => {
        if (clientId === doc.clientID || !st.board) return;
        const shape = sanitizeShape(st.board);
        if (shape) next.set(clientId, { shape, name: String(st.user?.name ?? 'Someone').slice(0, 24), color: safeColor(st.user?.color) });
      });
      const had = liveRef.current.size;
      liveRef.current = next;
      if (next.size || had) {
        setDrawing((prev) => {
          const names = [...next.values()].map((l) => l.name);
          return prev.length === names.length && prev.every((n, i) => n === names[i]) ? prev : names;
        });
        schedule();
      }
    };
    arr.observe(read);
    awareness.on('change', readLive);
    read();
    readLive();
    return () => {
      arr.unobserve(read);
      awareness.off('change', readLive);
    };
  }, [collab, me.userId, schedule]);

  // ---- sending what I am drawing right now ----------------------------------------------------------------------------------
  const publish = useCallback(() => {
    if (!collab || lowBw || liveTimer.current !== null) return;
    liveTimer.current = window.setTimeout(() => {
      liveTimer.current = null;
      const d = draftRef.current;
      collab.awareness.setLocalStateField('board', d ? { ...d, pts: [...d.pts] } : null);
    }, LIVE_MS);
  }, [collab, lowBw]);

  const clearLive = useCallback(() => {
    if (liveTimer.current !== null) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    collab?.awareness.setLocalStateField('board', null);
  }, [collab]);

  // Do not leave a half-drawn stroke on other people's screens if this panel goes away or the connection object changes.
  useEffect(
    () => () => {
      draftRef.current = null;
      collab?.awareness.setLocalStateField('board', null);
    },
    [collab],
  );

  // ---- changing the page ----------------------------------------------------------------------------------------------------
  const addShape = useCallback(
    (shape: BoardShape) => {
      if (!collab || !canEditRef.current) return;
      const arr = collab.doc.getArray<unknown>(BOARD_ARRAY);
      if (arr.length >= MAX_SHAPES) {
        toast('The board is full. Erase something or ask a mentor to clear it.', 'error');
        return;
      }
      collab.doc.transact(() => arr.push([shape]), 'board');
    },
    [collab, toast],
  );

  const erase = useCallback(
    (x: number, y: number) => {
      if (!collab) return;
      const arr = collab.doc.getArray<unknown>(BOARD_ARRAY);
      const hit: number[] = [];
      arr.forEach((v, i) => {
        const s = sanitizeShape(v);
        if (s && distanceToShape(s, x, y) <= ERASE_RADIUS) hit.push(i);
      });
      if (!hit.length) return;
      collab.doc.transact(() => {
        for (let k = hit.length - 1; k >= 0; k--) arr.delete(hit[k], 1);
      }, 'board');
    },
    [collab],
  );

  const undo = useCallback(() => {
    if (!collab || !canEditRef.current) return;
    const arr = collab.doc.getArray<unknown>(BOARD_ARRAY);
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = arr.get(i) as { by?: unknown } | null;
      if (v && v.by === me.userId) {
        collab.doc.transact(() => arr.delete(i, 1), 'board');
        return;
      }
    }
  }, [collab, me.userId]);

  const clearAll = () => {
    if (!collab || !room.isModerator) return;
    const arr = collab.doc.getArray<unknown>(BOARD_ARRAY);
    collab.doc.transact(() => arr.delete(0, arr.length), 'board');
    setConfirmClear(false);
  };

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const savePng = () => {
    const c = document.createElement('canvas');
    c.width = BOARD_W;
    c.height = BOARD_H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    for (const s of shapesRef.current) drawShape(ctx, s);
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whiteboard-${me.roomCode}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  // ---- text -----------------------------------------------------------------------------------------------------------------
  const commitText = useCallback(
    (text: string) => {
      const at = textAtRef.current;
      textAtRef.current = null;
      setTextAt(null);
      setTextDraft('');
      if (at && text.trim()) addShape({ id: newShapeId(), by: me.userId, tool: 'text', color, size, pts: [at.x, at.y], text: text.slice(0, MAX_TEXT_CHARS) });
    },
    [addShape, color, size, me.userId],
  );

  // ---- pointer ----------------------------------------------------------------------------------------------------------------
  const toBoard = (clientX: number, clientY: number): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [clamp(((clientX - r.left) / r.width) * BOARD_W, 0, BOARD_W), clamp(((clientY - r.top) / r.height) * BOARD_H, 0, BOARD_H)];
  };

  const finish = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    const d = draftRef.current;
    draftRef.current = null;
    clearLive();
    if (d) {
      const p = d.pts;
      const tiny = d.tool !== 'pen' && Math.hypot(p[2] - p[0], p[3] - p[1]) < 4;
      if (!tiny) addShape(d);
    }
    schedule();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    stageRef.current?.focus({ preventScroll: true });
    const [x, y] = toBoard(e.clientX, e.clientY);
    if (tool === 'text') {
      if (textAtRef.current) commitText(textDraft);
      setTextAt({ x, y });
      setTextDraft('');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    activeRef.current = true;
    if (tool === 'eraser') {
      erase(x, y);
      return;
    }
    draftRef.current = { id: newShapeId(), by: me.userId, tool, color, size, pts: tool === 'pen' ? [x, y] : [x, y, x, y] };
    publish();
    schedule();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length ? native.getCoalescedEvents() : [native];
    for (const ev of events) {
      const [x, y] = toBoard(ev.clientX, ev.clientY);
      if (tool === 'eraser') {
        erase(x, y);
        continue;
      }
      const d = draftRef.current;
      if (!d) return;
      if (d.tool === 'pen') {
        const n = d.pts.length;
        if (Math.hypot(x - d.pts[n - 2], y - d.pts[n - 1]) < MIN_STEP) continue;
        d.pts.push(x, y);
        if (d.pts.length >= MAX_PEN_NUMBERS) {
          // A very long scribble: save what we have and carry on in a new stroke from the same point.
          addShape({ ...d, pts: [...d.pts] });
          draftRef.current = { ...d, id: newShapeId(), pts: [x, y] };
        }
      } else {
        d.pts[2] = x;
        d.pts[3] = y;
      }
    }
    publish();
    schedule();
  };

  // ---- keyboard ---------------------------------------------------------------------------------------------------------------
  const onStageKey = (e: ReactKeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const toggleExpanded = () => {
    const opening = !expanded;
    setExpanded(opening);
    if (!opening) requestAnimationFrame(() => expandRef.current?.focus());
  };

  const k = box.w / BOARD_W;
  const cursor = !canDraw ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';
  const toolLabel = TOOLS.find((t) => t.id === tool)?.label ?? '';

  return (
    <div
      className={`bd-root${expanded ? ' expanded' : ''}`}
      data-testid="board-panel"
      data-expanded={expanded}
      role={expanded ? 'dialog' : 'region'}
      aria-modal={expanded || undefined}
      aria-label="Whiteboard"
    >
      <div className="bd-bar" role="toolbar" aria-label="Whiteboard tools">
        <div className="bd-group">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="bd-btn"
              aria-label={t.label}
              title={t.label}
              aria-pressed={tool === t.id}
              disabled={!canDraw}
              data-testid={`board-tool-${t.id}`}
              onClick={() => {
                if (textAtRef.current) commitText(textDraft);
                setTool(t.id);
              }}
            >
              <Icon name={t.icon} size={16} />
            </button>
          ))}
        </div>
        <div className="bd-group" role="group" aria-label="Colour">
          {BOARD_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              className="bd-btn"
              aria-label={c.name}
              title={c.name}
              aria-pressed={color === c.hex}
              disabled={!canDraw}
              data-testid={`board-color-${c.hex.slice(1)}`}
              onClick={() => setColor(c.hex)}
            >
              <span className="bd-swatch" style={{ background: c.hex }} />
            </button>
          ))}
        </div>
        <div className="bd-group" role="group" aria-label="Size">
          {BOARD_SIZES.map((s) => (
            <button
              key={s.size}
              type="button"
              className="bd-btn"
              aria-label={`${s.name} size`}
              title={`${s.name} size`}
              aria-pressed={size === s.size}
              disabled={!canDraw}
              data-testid={`board-size-${s.size}`}
              onClick={() => setSize(s.size)}
            >
              <span style={{ width: 4 + s.size, height: 4 + s.size, borderRadius: '50%', background: 'currentColor', display: 'block' }} />
            </button>
          ))}
        </div>
        <div className="bd-group">
          <button type="button" className="bd-btn" aria-label="Undo my last shape" title="Undo my last shape (Ctrl+Z)" disabled={!canDraw || counts.mine === 0} onClick={undo} data-testid="board-undo">
            <Icon name="undo" size={16} />
          </button>
          {room.isModerator &&
            (confirmClear ? (
              <button type="button" className="btn btn-sm" onClick={clearAll} data-testid="board-clear-confirm">
                Clear for everyone?
              </button>
            ) : (
              <button type="button" className="bd-btn" aria-label="Clear the whole board" title="Clear the whole board" disabled={!canDraw || counts.total === 0} onClick={() => setConfirmClear(true)} data-testid="board-clear">
                <Icon name="trash" size={16} />
              </button>
            ))}
          <button type="button" className="bd-btn" aria-label="Save the board as a picture" title="Save as picture (PNG)" disabled={counts.total === 0} onClick={savePng} data-testid="board-save">
            <Icon name="download" size={16} />
          </button>
          <button
            ref={expanded ? closeRef : expandRef}
            type="button"
            className="bd-btn"
            aria-label={expanded ? 'Close full view' : 'Open the board in a large view'}
            title={expanded ? 'Close full view (Esc)' : 'Large view'}
            onClick={toggleExpanded}
            data-testid="board-expand"
          >
            <Icon name={expanded ? 'shrink' : 'expand'} size={16} />
          </button>
        </div>
      </div>

      {!room.canEdit && room.readOnlyReason && (
        <div role="status" className="readonly-banner" data-testid="board-readonly">
          <Icon name="lock" size={13} /> {room.readOnlyReason}
        </div>
      )}

      <div ref={stageRef} className="bd-stage" tabIndex={-1} onKeyDown={onStageKey}>
        <div className="bd-canvas-wrap" style={{ width: box.w, height: box.h }}>
          <canvas
            ref={canvasRef}
            className="bd-canvas"
            style={{ width: box.w, height: box.h, cursor }}
            role="img"
            aria-label={`Shared whiteboard with ${counts.total} ${counts.total === 1 ? 'shape' : 'shapes'}. Draw with a mouse, pen or finger.`}
            data-testid="board-canvas"
            data-shapes={counts.total}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
          />
          {textAt && (
            <input
              className="bd-text"
              autoFocus
              aria-label="Text to place on the board"
              data-testid="board-text-input"
              maxLength={MAX_TEXT_CHARS}
              value={textDraft}
              style={{ left: (textAt.x / BOARD_W) * box.w, top: (textAt.y / BOARD_H) * box.h, fontSize: textSize(size) * k, color, fontFamily: BOARD_FONT, width: Math.max(120, (box.w - (textAt.x / BOARD_W) * box.w) * 0.9) }}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitText(textDraft);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  textAtRef.current = null;
                  setTextAt(null);
                  setTextDraft('');
                }
              }}
              onBlur={() => commitText(textDraft)}
            />
          )}
        </div>
      </div>

      <div className="bd-foot" aria-live="polite" data-testid="board-status">
        {!collab ? (
          'Connecting to the room...'
        ) : drawing.length ? (
          <>{drawing.join(', ')} {drawing.length === 1 ? 'is' : 'are'} drawing...</>
        ) : canDraw ? (
          <>
            {toolLabel} tool. {expanded ? 'Esc closes the large view.' : 'Use the expand button for a bigger board.'}
          </>
        ) : (
          'Watching. The board updates as others draw.'
        )}
      </div>
    </div>
  );
}

export default WhiteboardPanel;
