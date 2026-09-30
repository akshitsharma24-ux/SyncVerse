/**
 * Lane B (Simrit): editor markers from Lane B. EditorHandle.setMarkers REPLACES every marker, and two Lane B features use it
 * (the run error here, lint findings in ../quality), so both publish through this module, which merges them into one call.
 */
import type { EditorHandle, EditorMarker, RunResult } from '@syncverse/shared';

export type MarkerSource = 'run' | 'lint';

const store: Record<MarkerSource, EditorMarker[]> = { run: [], lint: [] };

/** Replaces one source's markers and pushes the merged set (run error first) to the editor. */
export function publishMarkers(editor: EditorHandle, source: MarkerSource, markers: EditorMarker[]): void {
  store[source] = markers;
  editor.setMarkers([...store.run, ...store.lint]);
}

/** Removes the run error marker and the line highlight. */
export function clearRunMarkers(editor: EditorHandle): void {
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
 * Marks the failing line of a finished run and scrolls to it. If the code changed under it (a collaborator edited that
 * line meanwhile) no marker is shown: a marker on the wrong line is worse than none.
 */
export function markRunError(editor: EditorHandle, run: RunResult): void {
  const line = run.errorLine;
  if (line && run.errorMessage && lineUnchanged(editor.getValue(), run.source, line)) {
    publishMarkers(editor, 'run', [{ line, message: run.errorMessage, severity: 'error' }]);
    editor.highlightLine(line);
  } else {
    clearRunMarkers(editor);
  }
}
