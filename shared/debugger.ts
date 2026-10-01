/**
 * Step-through debugger contract (Python). The server runs the program once under a tracer and sends back every step; the browser
 * replays them like an IDE debugger: current line, variables with their changes, call stack and the output so far. Used by
 * server/debugger/ and web/src/debug/.
 *
 * To stay small, a step carries only the variables that CHANGED in its frame since the previous step of that frame (the first step of
 * a frame carries all of them). `buildFrames` turns the steps back into full snapshots.
 */

export interface TraceStep {
  /** line about to run (1-based); for a `r` step, the line that returns */
  l: number;
  /** function name, `<module>` at the top level */
  f: string;
  /** call depth, 1 = top level */
  d: number;
  /** frame serial number: a new call gets a new number, so recursion keeps its frames apart */
  id: number;
  /** variables of this frame that changed (all of them when `n`) as short text */
  v: Record<string, string>;
  /** variables that no longer exist in this frame */
  x?: string[];
  /** first step of a new frame */
  n?: 1;
  /** value being returned, on a return step */
  r?: string;
  /** exception raised on this step, as `Type: message` */
  e?: string;
  /** characters the program had printed when this step began */
  o: number;
}

export interface TraceError {
  type: string;
  message: string;
  line?: number;
}

export interface DebugTrace {
  id: string;
  ownerId: string;
  ownerName: string;
  roomCode: string;
  language: 'python';
  source: string;
  stdin: string;
  steps: TraceStep[];
  /** everything the program printed */
  output: string;
  /** how the program ended, when it raised */
  error?: TraceError;
  /** the program ran past the step limit: only the first steps are here */
  truncated: boolean;
  createdAt: number;
  durationMs?: number;
}

export interface TraceFrame {
  step: TraceStep;
  /** the frame's variables at this step */
  vars: Record<string, string>;
  /** names that changed or appeared in this step */
  changed: string[];
  /** call stack, outermost first (the last one is the current frame) */
  stack: { f: string; id: number; line: number }[];
  /** what the program had printed so far */
  out: string;
}

/** Replay the trace: one full snapshot per step. */
export function buildFrames(trace: Pick<DebugTrace, 'steps' | 'output'>): TraceFrame[] {
  const state = new Map<number, Record<string, string>>();
  const stack: { f: string; id: number; line: number }[] = [];
  const frames: TraceFrame[] = [];
  for (const step of trace.steps) {
    const before = step.n ? {} : (state.get(step.id) ?? {});
    const vars: Record<string, string> = { ...before, ...step.v };
    for (const gone of step.x ?? []) delete vars[gone];
    state.set(step.id, vars);
    stack.length = Math.max(0, step.d - 1);
    stack[step.d - 1] = { f: step.f, id: step.id, line: step.l };
    frames.push({
      step,
      vars,
      changed: Object.keys(step.v).filter((name) => before[name] !== step.v[name]),
      stack: stack.map((s) => ({ ...s })),
      out: trace.output.slice(0, step.o),
    });
  }
  return frames;
}

/** The values a variable has had in its frame up to step `at`, oldest first, repeats collapsed. */
export function variableHistory(frames: TraceFrame[], at: number, name: string): string[] {
  const id = frames[at]?.step.id;
  const values: string[] = [];
  for (let i = 0; i <= at; i++) {
    if (frames[i].step.id !== id) continue;
    const v = frames[i].vars[name];
    if (v !== undefined && values[values.length - 1] !== v) values.push(v);
  }
  return values;
}

export const MAX_TRACE_STEPS = 1500;
