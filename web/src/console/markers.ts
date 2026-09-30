/**
 * Lane B (Simrit): editor markers from Lane B. EditorHandle.setMarkers REPLACES every marker, and two Lane B features use it
 * (the run error here, lint findings in ../quality), so both publish through this module, which merges them into one call.
 */
import type { EditorHandle, EditorMarker, RunResult } from '@syncverse/shared';

export type MarkerSource = 'run' | 'lint';

const store: Record<MarkerSource, EditorMarker[]> = { run: [], lint: [] };
/** The run error currently shown: its line, and the text that was run (to notice when that line changes). */
let active: { line: number; source: string } | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let lastSeen = '';
const RUN_FLASH_MS = 4000;

/** Replaces one source's markers and pushes the merged set (run error first) to the editor. */
export function publishMarkers(editor: EditorHandle, source: MarkerSource, markers: EditorMarker[]): void {
  store[source] = markers;
  editor.setMarkers([...store.run, ...store.lint]);
}

/** Removes the run error marker and the line highlight. */
export function clearRunMarkers(editor: EditorHandle): void {
  active = null;
  publishMarkers(editor, 'run', []);
  editor.highlightLine(null);
}

const lines = (s: string) => s.replace(/\r\n/g, '\n').split('\n');

/** True when line `n` reads the same in the current editor text as in the text that was run. */
function lineUnchanged(current: string, ran: string, n: number): boolean {
  const a = lines(current)[n - 1];
  const b = lines(ran)[n - 1];
  return a !== undefined && a === b;
}

/**
 * Marks the failing line of a finished run: a lasting squiggle marker plus a short red flash and scroll. If the code changed
 * under it (a collaborator edited that line meanwhile) nothing is shown: a marker on the wrong line is worse than none.
 * The red band is only a flash because the editor's highlight is a tracked decoration that would swell over the whole file
 * if the text were replaced (AI patch, samples menu); the squiggle is re-published on every text change instead.
 */
export function markRunError(editor: EditorHandle, run: RunResult): void {
  const line = run.errorLine;
  if (line && run.errorMessage && lineUnchanged(editor.getValue(), run.source, line)) {
    active = { line, source: run.source };
    lastSeen = editor.getValue();
    publishMarkers(editor, 'run', [{ line, message: run.errorMessage, severity: 'error' }]);
    flashLine(editor, line, RUN_FLASH_MS);
  } else {
    clearRunMarkers(editor);
  }
}

/**
 * Keeps the run error marker honest. Drops it once its line no longer reads the same; while the line is still the same but
 * the text changed (for example the whole file was replaced) it re-publishes the marker so its range is exactly that line.
 * Neither step moves the editor view.
 */
export function revalidateRunMarker(editor: EditorHandle): void {
  if (!active) return;
  const current = editor.getValue();
  if (current === lastSeen) return;
  lastSeen = current;
  if (!lineUnchanged(current, active.source, active.line)) clearRunMarkers(editor);
  else publishMarkers(editor, 'run', store.run);
}

/** Highlights a line briefly (the red band also scrolls it into view), then removes the highlight. */
export function flashLine(editor: EditorHandle, line: number, ms = 2500): void {
  if (flashTimer) clearTimeout(flashTimer);
  editor.highlightLine(line);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    editor.highlightLine(null);
  }, ms);
}
