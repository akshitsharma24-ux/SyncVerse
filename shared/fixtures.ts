/**
 * Ready-made example data for every shared type, so a lane can build and test its UI before anyone else's backend
 * exists (and before real runs, AI answers or grants happen). All values are realistic and consistent with
 * shared/samples.ts. Nothing here touches the network.
 *
 *   import { fixtureRuns, fixtureExplanations, fixtureDiagnostics, fixtureGrants, makeSeedEvents } from '@syncverse/shared';
 */
import type { DebugGrant, Diagnostic, Explanation, LearningEvent, PresenceUser, RunResult, RunStatus } from './types';
import { SAMPLE_BY_ID } from './samples';
import { conceptsForCategory, errorCategory } from './concepts';

const NOW = 1_790_000_000_000; // fixed instant so screenshots and tests are stable

function run(status: RunStatus, sampleId: string, over: Partial<RunResult>): RunResult {
  const s = SAMPLE_BY_ID[sampleId];
  return {
    id: `run-${status}`,
    ownerId: 'user-ravi',
    roomCode: 'loops-101',
    language: 'python',
    source: s.source,
    stdin: s.stdin,
    status,
    stdout: '',
    stderr: '',
    compileOutput: '',
    createdAt: NOW,
    ...over,
  };
}

/** One RunResult per RunStatus. */
export const fixtureRuns: Record<RunStatus, RunResult> = {
  queued: run('queued', 'stdin-average', {}),
  running: run('running', 'stdin-average', {}),
  success: run('success', 'stdin-average', { stdout: '4.0\n', timeMs: 12, memoryKb: 8200 }),
  runtime_error: run('runtime_error', 'index-error', {
    stderr: [
      'Traceback (most recent call last):',
      '  File "main.py", line 8, in <module>',
      '    print(average([3, 4, 5]))',
      '  File "main.py", line 4, in average',
      '    total += nums[i]',
      'IndexError: list index out of range',
      '',
    ].join('\n'),
    errorLine: 4,
    errorMessage: 'IndexError: list index out of range',
    timeMs: 14,
    memoryKb: 8300,
  }),
  compile_error: run('compile_error', 'syntax-error', {
    stderr: ['  File "main.py", line 1', '    def double(x)', '                 ^', "SyntaxError: expected ':'", ''].join('\n'),
    errorLine: 1,
    errorMessage: "SyntaxError: expected ':'",
    timeMs: 9,
    memoryKb: 7900,
  }),
  timeout: run('timeout', 'infinite-loop', {
    stdout: '0\n'.repeat(40) + '...(output truncated)\n',
    errorMessage: 'Stopped after the 5 second time limit.',
    timeMs: 5000,
    memoryKb: 9100,
  }),
  memory_limit: run('memory_limit', 'infinite-loop', {
    stderr: 'MemoryError\n',
    errorMessage: 'Stopped: the program used more than 128 MB.',
    timeMs: 820,
    memoryKb: 131072,
  }),
  service_error: run('service_error', 'stdin-average', {
    errorMessage: 'The code runner did not answer. Try again in a moment.',
  }),
};

/** Pre-baked explanations keyed by sample id (correct for those exact programs; usable as an AI answer cache). */
export const fixtureExplanations: Record<string, Explanation> = Object.fromEntries(
  Object.values(SAMPLE_BY_ID)
    .filter((s) => s.explanation)
    .map((s) => [s.id, s.explanation as Explanation]),
);

/** What the quality panel should find in the 'quality-smells' sample (Lane B's six rules). */
export const fixtureDiagnostics: Diagnostic[] = [
  { category: 'naming', severity: 'info', line: 1, col: 5, rule: 'short-name', message: "'f' is a one-letter name. A name like total_score tells the reader what it does." },
  { category: 'naming', severity: 'info', line: 2, col: 5, rule: 'short-name', message: "'t' is a one-letter name. Try total." },
  { category: 'complexity', severity: 'warning', line: 6, col: 17, rule: 'deep-nesting', message: 'Loops are nested 4 deep. Deeply nested code is hard to read and slow for big inputs.' },
  { category: 'smell', severity: 'info', line: 8, col: 49, rule: 'magic-number', message: 'The numbers 3.14159, 86400 and 7 have no names. Put each in a named constant.' },
  { category: 'security', severity: 'warning', line: 10, col: 13, rule: 'dangerous-eval', message: 'eval runs any text as code. Avoid it, especially with input from users.' },
  { category: 'smell', severity: 'warning', line: 11, col: 5, rule: 'bare-except', message: 'A bare except hides every error, including your own bugs. Name the error you expect.' },
  { category: 'formatting', severity: 'info', line: 13, col: 101, rule: 'line-too-long', message: 'This line is longer than 100 characters. Split it or shorten the comment.' },
];

/** One DebugGrant per status. The mentor 'Asha' asks to see student 'Ravi'. */
export const fixtureGrants: Record<DebugGrant['status'], DebugGrant> = {
  requested: { id: 'grant-1', ownerId: 'user-ravi', granteeId: 'user-asha', granteeName: 'Asha', status: 'requested', createdAt: NOW },
  active: { id: 'grant-1', ownerId: 'user-ravi', granteeId: 'user-asha', granteeName: 'Asha', status: 'active', createdAt: NOW, expiresAt: NOW + 30 * 60 * 1000 },
  denied: { id: 'grant-1', ownerId: 'user-ravi', granteeId: 'user-asha', granteeName: 'Asha', status: 'denied', createdAt: NOW },
  revoked: { id: 'grant-1', ownerId: 'user-ravi', granteeId: 'user-asha', granteeName: 'Asha', status: 'revoked', createdAt: NOW, expiresAt: NOW + 30 * 60 * 1000 },
  expired: { id: 'grant-1', ownerId: 'user-ravi', granteeId: 'user-asha', granteeName: 'Asha', status: 'expired', createdAt: NOW - 3_600_000, expiresAt: NOW - 1_800_000 },
};

/** Three people in a room, one of each state. */
export const fixturePresence: PresenceUser[] = [
  { userId: 'user-asha', name: 'Asha', color: '#b8531b', role: 'mentor', state: 'online' },
  { userId: 'user-ravi', name: 'Ravi', color: '#1f5fbf', role: 'student', state: 'typing' },
  { userId: 'user-mei', name: 'Mei', color: '#26794f', role: 'student', state: 'idle' },
];

/**
 * A believable history for ONE student so the progress page has something to show on a fresh start.
 * The last 10 runs are built so the "Retry recommended" observation fires for loop-boundaries:
 * 4 IndexError failures, the latest run is a failure (see OBSERVATION_RULE in concepts.ts).
 * Timestamps are spread over the last ~2 days before `now`.
 */
export function makeSeedEvents(opts: { userId: string; roomCode: string; now?: number }): LearningEvent[] {
  const { userId, roomCode } = opts;
  const now = opts.now ?? Date.now();
  // oldest -> newest
  const runs: Array<{ status: RunStatus; stderr: string }> = [
    { status: 'success', stderr: '' },
    { status: 'runtime_error', stderr: 'NameError: name \'mesage\' is not defined' },
    { status: 'success', stderr: '' },
    { status: 'runtime_error', stderr: 'IndexError: list index out of range' },
    { status: 'runtime_error', stderr: 'TypeError: can only concatenate str (not "int") to str' },
    { status: 'success', stderr: '' },
    { status: 'runtime_error', stderr: 'IndexError: list index out of range' },
    { status: 'runtime_error', stderr: 'IndexError: list index out of range' },
    { status: 'success', stderr: '' },
    { status: 'runtime_error', stderr: 'IndexError: list index out of range' },
  ];
  const events: LearningEvent[] = [];
  const step = (48 * 3_600_000) / runs.length;
  runs.forEach((r, i) => {
    const at = Math.round(now - (runs.length - i) * step);
    const category = errorCategory(r.status, r.stderr);
    const concepts = conceptsForCategory(category);
    events.push({ userId, roomCode, at, type: 'run', category, concepts, ok: r.status === 'success' });
    if (r.status !== 'success' && i !== runs.length - 1) events.push({ userId, roomCode, at: at + 20_000, type: 'explain', category, concepts });
    if (i === 6) events.push({ userId, roomCode, at: at + 60_000, type: 'patch', category, concepts, ok: true });
  });
  return events;
}

