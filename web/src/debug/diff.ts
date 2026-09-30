/**
 * Lane D: a small line diff for the "suggested edit" review (what would change if the student accepts).
 * Pure functions, no DOM, so they can be unit tested with `node --import tsx`.
 */
export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

const LCS_LIMIT = 4_000_000; // cells; bigger inputs fall back to "replace the changed middle"

const lines = (s: string) => s.replace(/\r\n/g, '\n').split('\n');

/** Line-by-line difference from `a` (current code) to `b` (suggested code). */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = lines(a);
  const y = lines(b);
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const head: DiffLine[] = x.slice(0, start).map((text) => ({ kind: 'same', text }));
  const tail: DiffLine[] = x.slice(endX).map((text) => ({ kind: 'same', text }));
  const mx = x.slice(start, endX);
  const my = y.slice(start, endY);
  const n = mx.length;
  const m = my.length;
  let middle: DiffLine[] = [];
  if (n * m > LCS_LIMIT) {
    middle = [...mx.map((text) => ({ kind: 'del' as const, text })), ...my.map((text) => ({ kind: 'add' as const, text }))];
  } else if (n === 0 || m === 0) {
    middle = [...mx.map((text) => ({ kind: 'del' as const, text })), ...my.map((text) => ({ kind: 'add' as const, text }))];
  } else {
    // Longest common subsequence table, then walk it to emit same / del / add.
    const w = m + 1;
    const t = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i * w + j] = mx[i] === my[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (mx[i] === my[j]) {
        middle.push({ kind: 'same', text: mx[i] });
        i++;
        j++;
      } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) {
        middle.push({ kind: 'del', text: mx[i++] });
      } else {
        middle.push({ kind: 'add', text: my[j++] });
      }
    }
    while (i < n) middle.push({ kind: 'del', text: mx[i++] });
    while (j < m) middle.push({ kind: 'add', text: my[j++] });
  }
  return [...head, ...middle, ...tail];
}

export type CollapsedLine = DiffLine | { kind: 'skip'; count: number };

/** Hides long unchanged stretches, keeping `context` lines around every change. */
export function collapseDiff(diff: DiffLine[], context = 2): CollapsedLine[] {
  const keep = new Array<boolean>(diff.length).fill(false);
  diff.forEach((d, i) => {
    if (d.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) keep[k] = true;
  });
  const out: CollapsedLine[] = [];
  let skipped = 0;
  diff.forEach((d, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: 'skip', count: skipped });
      skipped = 0;
      out.push(d);
    } else {
      skipped++;
    }
  });
  if (skipped) out.push({ kind: 'skip', count: skipped });
  return out;
}

/** True when the two texts differ in at least one line (ignores CRLF vs LF). */
export const changed = (a: string, b: string) => a.replace(/\r\n/g, '\n') !== b.replace(/\r\n/g, '\n');
