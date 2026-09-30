/** Whiteboard drawing and hit-testing. Pure functions on BoardShape (shared/whiteboard.ts); no React, no Yjs. Owner: Lane A. */
import { BOARD_W, textSize, type BoardShape } from '@syncverse/shared';

/** The board is always a light "paper" page, so a stored colour looks the same in light and dark mode for everyone. */
export const BOARD_BG = '#fbfaf7';
export const BOARD_FONT = "'Geist Variable', 'Segoe UI', system-ui, sans-serif";

export function drawShape(ctx: CanvasRenderingContext2D, s: BoardShape, alpha = 1): void {
  const p = s.pts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (s.tool) {
    case 'pen': {
      if (p.length <= 2) {
        ctx.arc(p[0], p[1], s.size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      // Smooth the stroke: a curve through the midpoints of consecutive samples, with the samples as control points.
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[2], p[3]);
      ctx.stroke();
      if (s.tool === 'arrow' && Math.hypot(p[2] - p[0], p[3] - p[1]) > 1) {
        const a = Math.atan2(p[3] - p[1], p[2] - p[0]);
        const head = 12 + s.size * 2.5;
        ctx.beginPath();
        ctx.moveTo(p[2] - head * Math.cos(a - 0.45), p[3] - head * Math.sin(a - 0.45));
        ctx.lineTo(p[2], p[3]);
        ctx.lineTo(p[2] - head * Math.cos(a + 0.45), p[3] - head * Math.sin(a + 0.45));
        ctx.stroke();
      }
      break;
    }
    case 'rect':
      ctx.strokeRect(Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.abs(p[2] - p[0]), Math.abs(p[3] - p[1]));
      break;
    case 'ellipse':
      ctx.ellipse((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, Math.max(Math.abs(p[2] - p[0]) / 2, 0.5), Math.max(Math.abs(p[3] - p[1]) / 2, 0.5), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'text':
      ctx.font = `500 ${textSize(s.size)}px ${BOARD_FONT}`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text ?? '', p[0], p[1]);
      break;
  }
  ctx.restore();
}

/** A small name tag at the end of someone else's stroke while they draw it. */
export function drawTag(ctx: CanvasRenderingContext2D, name: string, color: string, x: number, y: number, scale: number): void {
  const fs = 13 / scale;
  ctx.save();
  ctx.font = `600 ${fs}px ${BOARD_FONT}`;
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 10 / scale;
  const h = 18 / scale;
  const tx = Math.min(x + 8 / scale, BOARD_W - w);
  const ty = Math.max(y - h - 4 / scale, 0);
  ctx.fillStyle = color;
  ctx.fillRect(tx, ty, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, tx + 5 / scale, ty + h / 2);
  ctx.restore();
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Rough width of a text shape, enough to click on it without measuring a real font. */
export function textBox(s: BoardShape): { x: number; y: number; w: number; h: number } {
  const fs = textSize(s.size);
  return { x: s.pts[0], y: s.pts[1], w: Math.max(fs * 0.6 * (s.text?.length ?? 1), fs), h: fs * 1.25 };
}

/** Distance in board units from a point to the ink of a shape (0 when the point is on it). */
export function distanceToShape(s: BoardShape, x: number, y: number): number {
  const p = s.pts;
  switch (s.tool) {
    case 'pen': {
      if (p.length <= 2) return Math.max(0, Math.hypot(x - p[0], y - p[1]) - s.size / 2);
      let best = Infinity;
      for (let i = 0; i + 3 < p.length; i += 2) best = Math.min(best, distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]));
      return Math.max(0, best - s.size / 2);
    }
    case 'line':
    case 'arrow':
      return Math.max(0, distToSegment(x, y, p[0], p[1], p[2], p[3]) - s.size / 2);
    case 'rect': {
      const [x1, x2] = [Math.min(p[0], p[2]), Math.max(p[0], p[2])];
      const [y1, y2] = [Math.min(p[1], p[3]), Math.max(p[1], p[3])];
      const d = Math.min(distToSegment(x, y, x1, y1, x2, y1), distToSegment(x, y, x2, y1, x2, y2), distToSegment(x, y, x2, y2, x1, y2), distToSegment(x, y, x1, y2, x1, y1));
      return Math.max(0, d - s.size / 2);
    }
    case 'ellipse': {
      const rx = Math.max(Math.abs(p[2] - p[0]) / 2, 1);
      const ry = Math.max(Math.abs(p[3] - p[1]) / 2, 1);
      const k = Math.hypot((x - (p[0] + p[2]) / 2) / rx, (y - (p[1] + p[3]) / 2) / ry);
      return Math.max(0, Math.abs(k - 1) * Math.min(rx, ry) - s.size / 2);
    }
    case 'text': {
      const b = textBox(s);
      return Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
    }
  }
}
