/**
 * Whiteboard contract. Owner: Lane A. Used by the web whiteboard panel (web/src/whiteboard).
 *
 * The board lives in the SAME Yjs document as the code (see shared/files.ts), as one Y.Array called 'board' whose items are
 * plain BoardShape objects. That gives it, for free: persistence with the room, reconnect merging, and the room's write rules
 * (the collab server already drops document changes from viewers, paused members and, while frozen, students).
 * A shape that is still being drawn is shown to others through Yjs awareness (field 'board') and is only written to the array
 * when the pen is lifted.
 *
 * Coordinates are in board units on a fixed 1600 x 900 page, so every screen shows the same drawing at a different scale.
 * Anyone in the room can write anything into the array, so the reader must call sanitizeShape() before drawing a shape.
 * Colours are plain #rrggbb values. The palette a frontend offers (and the page colour) is that frontend's own choice;
 * BOARD_COLORS below is the palette for a light page.
 */

export const BOARD_ARRAY = 'board';
export const BOARD_W = 1600;
export const BOARD_H = 900;
export const MAX_SHAPES = 1500;
/** Numbers (x, y, x, y, ...) in one pen stroke. A longer stroke is saved and continued as a new one. */
export const MAX_PEN_NUMBERS = 1200;
export const MAX_TEXT_CHARS = 120;

export type ShapeTool = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';

export const SHAPE_TOOLS: readonly ShapeTool[] = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'text'];

/** Colours that read well on the (always light) board. The first one is the default ink. */
export const BOARD_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#151515', name: 'Black' },
  { hex: '#1f5fbf', name: 'Blue' },
  { hex: '#247548', name: 'Green' },
  { hex: '#b03426', name: 'Red' },
  { hex: '#b8531b', name: 'Orange' },
  { hex: '#6b4fbb', name: 'Purple' },
];

export const BOARD_SIZES: readonly { size: number; name: string }[] = [
  { size: 3, name: 'Thin' },
  { size: 6, name: 'Medium' },
  { size: 12, name: 'Thick' },
];

export interface BoardShape {
  id: string;
  /** userId of whoever drew it (used by Undo, which only takes back your own last shape) */
  by: string;
  tool: ShapeTool;
  color: string;
  /** stroke width in board units (one of BOARD_SIZES); text uses it through textSize() */
  size: number;
  /** pen: x0,y0,x1,y1,...   line, arrow, rect, ellipse: x0,y0,x1,y1 (two corners)   text: x,y (top-left) */
  pts: number[];
  text?: string;
}

/** Font size in board units for a text shape drawn with the given brush size. */
export const textSize = (size: number): number => 20 + size * 3;

export function newShapeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Returns a safe copy of anything read from the shared document or from awareness, or null when it is not a usable shape.
 * Numbers are clamped to the page, the colour must be a plain hex value (else fallbackColor), text is cut to MAX_TEXT_CHARS.
 */
export function sanitizeShape(v: unknown, fallbackColor: string = BOARD_COLORS[0].hex): BoardShape | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.tool !== 'string' || !(SHAPE_TOOLS as readonly string[]).includes(s.tool)) return null;
  const tool = s.tool as ShapeTool;
  if (!Array.isArray(s.pts)) return null;
  const raw = s.pts.slice(0, MAX_PEN_NUMBERS + 2);
  if (!raw.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const pts = raw.map((n, i) => clamp(n as number, 0, i % 2 === 0 ? BOARD_W : BOARD_H));
  const need = tool === 'pen' ? 2 : tool === 'text' ? 2 : 4;
  if (pts.length < need || pts.length % 2 !== 0) return null;
  if (tool !== 'pen' && tool !== 'text' && pts.length !== 4) return null;
  if (tool === 'text' && pts.length !== 2) return null;
  const text = tool === 'text' ? (typeof s.text === 'string' ? s.text.slice(0, MAX_TEXT_CHARS) : '') : undefined;
  if (tool === 'text' && !text?.trim()) return null;
  return {
    id: typeof s.id === 'string' ? s.id.slice(0, 24) : '',
    by: typeof s.by === 'string' ? s.by.slice(0, 64) : '',
    tool,
    color: typeof s.color === 'string' && COLOR_RE.test(s.color) ? s.color : fallbackColor,
    size: typeof s.size === 'number' && Number.isFinite(s.size) ? clamp(s.size, 1, 24) : 6,
    pts,
    ...(text !== undefined ? { text } : {}),
  };
}
