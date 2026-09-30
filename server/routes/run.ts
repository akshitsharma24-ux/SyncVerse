/**
 * Lane B (Simrit): P-B1 run pipeline.
 *   POST /api/run            -> { id }                 (returns at once; the run finishes in the background)
 *   GET  /api/run/:id        -> RunResult              (owner or active grantee via canView, else 403)
 *   GET  /api/runs/latest    -> RunResult | null       (?ownerId=, default = caller; same access rule)
 *   GET  /api/run-info       -> { runner, sandboxed, languages }
 * Runner: Judge0 when JUDGE0_URL is set (RUNNER=local forces the local one), otherwise a local subprocess that is
 * NOT sandboxed (demo fallback, plan 7.3). Judge0 failures become `service_error`; they never fall back silently.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { RunResult, RunStatus } from '@syncverse/shared';
import { requireUser } from '../identity';
import { canView } from './debug';
import { logEvent } from './events';

// ---- limits (plan 4.4 / blueprint 6.2) ------------------------------------------------------
const MAX_SOURCE_CHARS = 100_000;
const MAX_STDIN_BYTES = 10 * 1024;
const MAX_STDOUT_CHARS = 64 * 1024;
const MAX_ERR_CHARS = 16 * 1024;
const CPU_LIMIT_S = 5;
const WALL_LIMIT_S = 10;
const MEMORY_LIMIT_KB = 128 * 1024;
const POLL_MS = 500;
const GIVE_UP_MS = 15_000;
const MIN_INTERVAL_MS = Number(process.env.RUN_MIN_INTERVAL_MS ?? 2000);
const MAX_PER_10_MIN = Number(process.env.RUN_MAX_PER_10_MIN ?? 30);
const MAX_IN_FLIGHT = 2;
const KEEP_RUNS_PER_USER = 200;

const LANGUAGES = ['python', 'c', 'cpp', 'java', 'javascript'] as const;
type Lang = (typeof LANGUAGES)[number];
const LANGUAGE_LABEL: Record<Lang, string> = { python: 'Python', c: 'C', cpp: 'C++', java: 'Java', javascript: 'JavaScript' };

// ---- storage (in memory, resets on restart) ---------------------------------------------------
const runs = new Map<string, RunResult>();
const runsByOwner = new Map<string, string[]>(); // oldest first

export function getRun(id: string): RunResult | undefined {
  return runs.get(id);
}

export function getLatestRunFor(ownerId: string): RunResult | undefined {
  const ids = runsByOwner.get(ownerId);
  if (!ids) return undefined;
  let latest: RunResult | undefined;
  for (const id of ids) {
    const r = runs.get(id);
    if (r && (!latest || r.createdAt >= latest.createdAt)) latest = r;
  }
  return latest;
}

function remember(run: RunResult): void {
  runs.set(run.id, run);
  const ids = runsByOwner.get(run.ownerId) ?? [];
  ids.push(run.id);
  while (ids.length > KEEP_RUNS_PER_USER) runs.delete(ids.shift() as string);
  runsByOwner.set(run.ownerId, ids);
}

// ---- rate limiting -----------------------------------------------------------------------------
const recentStarts = new Map<string, number[]>();
const inFlight = new Map<string, number>();

/** Returns a message when the user must wait, or null (and records the start) when the run may go ahead. */
function admit(userId: string): string | null {
  const now = Date.now();
  const starts = (recentStarts.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  if ((inFlight.get(userId) ?? 0) >= MAX_IN_FLIGHT) return 'Your previous runs are still going. Wait a moment.';
  const last = starts[starts.length - 1];
  if (last !== undefined && now - last < MIN_INTERVAL_MS) return 'You are running too fast. Wait a second and try again.';
  if (starts.length >= MAX_PER_10_MIN) return `Run limit reached (${MAX_PER_10_MIN} runs per 10 minutes). Try again shortly.`;
  starts.push(now);
  recentStarts.set(userId, starts);
  inFlight.set(userId, (inFlight.get(userId) ?? 0) + 1);
  return null;
}

function release(userId: string): void {
  const n = (inFlight.get(userId) ?? 1) - 1;
  if (n <= 0) inFlight.delete(userId);
  else inFlight.set(userId, n);
}

// ---- output helpers ----------------------------------------------------------------------------
const clean = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const capHead = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '\n[output truncated]' : s);
const capTail = (s: string, max: number) => (s.length > max ? '[earlier output truncated]\n' + s.slice(-max) : s);

// ---- Python error parsing (P-B3) ---------------------------------------------------------------------
/** Last unindented "Name: message" line of a Python error, e.g. "IndexError: list index out of range". */
function exceptionLine(stderr: string): string | undefined {
  const lines = stderr.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l || /^\s/.test(l) || /^(Traceback|During handling|The above exception|\[)/.test(l)) continue;
    if (/^[A-Za-z_][\w.]*(:|$)/.test(l)) return l.trim();
  }
  return undefined;
}

/** Name of the exception in a Python-style error, e.g. "IndexError". */
export function errorKind(stderr: string): string | undefined {
  const l = exceptionLine(stderr);
  return l ? /^[A-Za-z_][\w.]*/.exec(l)?.[0].split('.').pop() : undefined;
}

/**
 * Line (1-based, inside the student's own program) and message of a Python failure. The line comes from the last
 * `File ".../script.py", line N` frame, never from a model. Python 3.8 to 3.13 formats are handled (caret lines ignored).
 */
export function parsePythonError(stderr: string, source: string): { line?: number; message?: string } {
  const lines = stderr.split('\n');
  const start = lines.lastIndexOf('Traceback (most recent call last):'); // only the final exception's frames
  let line: number | undefined;
  for (let i = Math.max(start, 0); i < lines.length; i++) {
    const m = /^\s*File "([^"]*)", line (\d+)/.exec(lines[i]);
    if (m && /^script\.py$/.test(m[1].split(/[\\/]/).pop() ?? '')) line = Number(m[2]);
  }
  const total = source.replace(/\r\n/g, '\n').split('\n').length;
  if (line !== undefined && (line < 1 || line > total)) line = undefined;
  const message = exceptionLine(stderr)?.slice(0, 300);
  return { line, message };
}

// ---- error parsing for the other languages (P-B5) -----------------------------------------------------------
type Parsed = { line?: number; message?: string };

const sourceLines = (source: string) => source.replace(/\r\n/g, '\n').split('\n');
const inRange = (line: number | undefined, source: string) =>
  line !== undefined && line >= 1 && line <= sourceLines(source).length ? line : undefined;

/** Node.js: the first `script.js:LINE` in the output is where the error happened (works for syntax errors too). */
export function parseNodeError(stderr: string, source: string): Parsed {
  const m = /script\.js:(\d+)/.exec(stderr);
  return { line: inRange(m ? Number(m[1]) : undefined, source), message: exceptionLine(stderr)?.slice(0, 300) };
}

/** gcc / g++ compile output: the first `main.c:LINE:COL: error: ...`. */
export function parseGccError(output: string, source: string): Parsed {
  const m = /^(?:\S*\/)?main\.(?:c|cpp):(\d+):(\d+): (?:fatal )?error: (.+)$/m.exec(output);
  if (!m) {
    const link = /undefined reference to [`'](\w+)'/.exec(output);
    if (link) return { message: `error: undefined reference to '${link[1]}' (the function is used but never defined or linked)` };
    const any = /^.*\berror\b.*$/m.exec(output);
    return { message: any ? any[0].trim().slice(0, 300) : undefined };
  }
  let line = Number(m[1]);
  const col = Number(m[2]);
  const message = m[3];
  // gcc reports a missing ';' at the START of the next line. If the error token begins its line, blame the previous statement.
  if (/^expected .*[;,)].* before /.test(message) || /^expected ';'/.test(message)) {
    const lines = sourceLines(source);
    if (col === (lines[line - 1] ?? '').search(/\S/) + 1) {
      let p = line - 2;
      while (p >= 0 && !lines[p].trim()) p--;
      if (p >= 0) line = p + 1;
    }
  }
  return { line: inRange(line, source), message: `error: ${message}`.slice(0, 300) };
}

/** javac compile output: the first `Main.java:LINE: error: ...`. */
export function parseJavacError(output: string, source: string): Parsed {
  const m = /^Main\.java:(\d+): error: (.+)$/m.exec(output);
  return m ? { line: inRange(Number(m[1]), source), message: `error: ${m[2]}`.slice(0, 300) } : {};
}

/** Java exception: `Exception in thread "main" java.lang.X: msg` and the first `(Main.java:N)` stack frame (the student's code). */
export function parseJavaRuntimeError(stderr: string, source: string): Parsed {
  const head = /Exception in thread "[^"]*" ([\w.$]+)(?:: (.*))?/.exec(stderr);
  const frame = /\(Main\.java:(\d+)\)/.exec(stderr);
  const name = head ? head[1].split('.').pop() : undefined;
  return {
    line: inRange(frame ? Number(frame[1]) : undefined, source),
    message: name ? `${name}${head?.[2] ? ': ' + head[2] : ''}`.slice(0, 300) : undefined,
  };
}

type NativeCrash = { kind: string; message: string };
/** C / C++ crashes arrive as a shell line such as "Segmentation fault (core dumped)"; explain them in plain words. */
export function describeNativeCrash(stderr: string): NativeCrash | undefined {
  const thrown = /terminate called after throwing an instance of '([^']+)'(?:\s*what\(\):\s*(.*))?/.exec(stderr);
  if (thrown)
    return {
      kind: 'UncaughtException',
      message: `Uncaught C++ exception ${thrown[1]}${thrown[2] ? ': ' + thrown[2].trim() : ''}`,
    };
  if (/Segmentation fault/.test(stderr)) {
    return {
      kind: 'SegmentationFault',
      message: 'Segmentation fault: the program used memory it should not (check array indexes and pointers).',
    };
  }
  if (/Floating point exception/.test(stderr))
    return { kind: 'ArithmeticError', message: 'Arithmetic error: most likely a division by zero.' };
  if (/Aborted/.test(stderr))
    return { kind: 'Abort', message: 'The program aborted (a failed assert(), an uncaught exception, or bad memory handling).' };
  if (/Bus error/.test(stderr)) return { kind: 'BusError', message: 'Bus error: the program accessed memory in an invalid way.' };
  return undefined;
}

/** Sets errorLine / errorMessage on a finished failed run. */
function annotateError(run: RunResult): void {
  if (run.status === 'timeout') {
    run.errorMessage = 'Time limit exceeded (5 s). Check for an infinite loop.';
    return;
  }
  if (run.status === 'memory_limit') {
    run.errorMessage = 'Memory limit exceeded (128 MB).';
    return;
  }
  if (run.status !== 'runtime_error' && run.status !== 'compile_error') return;
  const compile = run.status === 'compile_error';
  let parsed: Parsed;
  switch (run.language as Lang) {
    case 'javascript':
      parsed = parseNodeError(run.stderr, run.source);
      break;
    case 'java':
      parsed = compile ? parseJavacError(run.compileOutput, run.source) : parseJavaRuntimeError(run.stderr, run.source);
      break;
    case 'c':
    case 'cpp':
      parsed = compile ? parseGccError(run.compileOutput, run.source) : { message: describeNativeCrash(run.stderr)?.message };
      break;
    default: {
      const p = parsePythonError(run.stderr, run.source);
      parsed = { line: p.line, message: p.message };
    }
  }
  run.errorLine = parsed.line;
  run.errorMessage = parsed.message;
}

/** The error category sent to the progress page (Lane D groups these): exception name, or a fixed word. */
function categoryOf(run: RunResult): string {
  if (run.status === 'success') return 'success';
  if (run.status === 'timeout' || run.status === 'memory_limit') return run.status;
  switch (run.language as Lang) {
    case 'java':
      return run.status === 'compile_error' ? 'compile_error' : (run.errorMessage?.split(':')[0] ?? run.status);
    case 'c':
    case 'cpp':
      return run.status === 'compile_error' ? 'compile_error' : (describeNativeCrash(run.stderr)?.kind ?? run.status);
    default:
      return errorKind(run.stderr) ?? run.status;
  }
}

/**
 * Java's runner saves the file as Main.java, so `public class Foo` cannot compile. Rename the class that holds main() to Main
 * (identifiers only, never text inside strings or comments) and tell the student.
 */
export function prepareJava(source: string): { source: string; note?: string } {
  const mainAt = source.search(/public\s+static\s+void\s+main\s*\(/);
  if (mainAt < 0) return { source };
  // The class to rename: the public top-level class (Java allows one), else the last top-level class before main().
  // Nested classes (`static class Node`) are not top-level and are left alone.
  const publicClass = /\bpublic\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/.exec(source);
  const topLevel = [...source.slice(0, mainAt).matchAll(/^(?:final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/gm)];
  const name = publicClass ? publicClass[1] : topLevel.length ? topLevel[topLevel.length - 1][1] : undefined;
  if (!name || name === 'Main' || /\bclass\s+Main\b/.test(source)) return { source };
  const token = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|([A-Za-z_$][\w$]*)/g;
  const renamed = source.replace(token, (m: string, skip: string | undefined, ident: string | undefined) =>
    !skip && ident === name ? 'Main' : m,
  );
  return { source: renamed, note: `Note: your class ${name} was renamed to Main so it can run here.\n` };
}

// ---- runner interface ----------------------------------------------------------------------------
interface ExecInput {
  language: Lang;
  source: string;
  stdin: string;
}
interface ExecOutcome {
  status: RunStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  timeMs?: number;
  memoryKb?: number;
}

class ServiceError extends Error {}

const judge0Url = () => (process.env.JUDGE0_URL ?? '').replace(/\/+$/, '');
const useJudge0 = () => Boolean(judge0Url()) && process.env.RUNNER !== 'local';

function judge0Headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.JUDGE0_API_KEY) h['x-rapidapi-key'] = process.env.JUDGE0_API_KEY;
  if (process.env.JUDGE0_API_HOST) h['x-rapidapi-host'] = process.env.JUDGE0_API_HOST;
  return h;
}

async function j0<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(judge0Url() + pathAndQuery, { ...init, headers: judge0Headers(), signal: AbortSignal.timeout(8000) });
  } catch {
    throw new ServiceError('Could not reach the code runner.');
  }
  if (res.status === 429) throw new ServiceError('The code runner is busy (rate limited). Try again in a moment.');
  if (!res.ok) throw new ServiceError(`The code runner answered HTTP ${res.status}.`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ServiceError('The code runner sent an unreadable answer.');
  }
}

// Judge0 language ids differ between instances, so read GET /languages once and map by name (newest version wins;
// Python prefers 3.12 because its error messages are the most helpful to beginners and stable to parse).
const NAME_PATTERN: Record<Lang, RegExp> = {
  python: /^Python \(3\./,
  c: /^C \(GCC/,
  cpp: /^C\+\+ \(GCC/,
  java: /^Java \(/,
  javascript: /^JavaScript \(Node/,
};
const FALLBACK_ID: Record<Lang, number> = { python: 71, c: 50, cpp: 54, java: 62, javascript: 63 };
const COMPILER_OPTIONS: Partial<Record<Lang, string>> = { c: '-Wall -Wextra -lm', cpp: '-Wall -Wextra' }; // -lm: math.h functions need it in C

const versionOf = (name: string): number[] => (/\(([^)]*)\)/.exec(name)?.[1].match(/\d+/g) ?? []).map(Number);
function newestFirst(a: { name: string }, b: { name: string }): number {
  const va = versionOf(a.name);
  const vb = versionOf(b.name);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
  return 0;
}

/** Exported for tests: picks one id per language from a Judge0 /languages list. */
export function pickLanguageIds(list: { id: number; name: string }[]): Record<Lang, number> {
  const ids = { ...FALLBACK_ID };
  for (const lang of LANGUAGES) {
    const matches = list.filter((l) => NAME_PATTERN[lang].test(l.name)).sort(newestFirst);
    const pick = lang === 'python' ? (matches.find((l) => l.name.startsWith('Python (3.12')) ?? matches[0]) : matches[0];
    if (pick) ids[lang] = pick.id;
  }
  return ids;
}

let languageIds: Promise<Record<Lang, number>> | null = null;

function loadLanguageIds(): Promise<Record<Lang, number>> {
  if (!languageIds) {
    languageIds = j0<{ id: number; name: string }[]>('/languages').then(pickLanguageIds);
    languageIds.catch(() => {
      languageIds = null; // do not cache a failure
    });
  }
  return languageIds;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Judge0Submission {
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
}

/** Judge0 status -> our RunStatus (plan 4.4 / blueprint appendix B). */
export function mapJudge0Status(statusId: number, stderr: string, memoryKb?: number): RunStatus {
  if (statusId === 3) return 'success';
  if (statusId === 5) return 'timeout';
  if (statusId === 6) return 'compile_error';
  if (statusId >= 7 && statusId <= 12) {
    // Python reports syntax errors while running, so Judge0 calls them runtime errors.
    if (/\b(SyntaxError|IndentationError|TabError)\b/.test(stderr)) return 'compile_error';
    if (/\bMemoryError\b/.test(stderr) || (memoryKb !== undefined && memoryKb >= MEMORY_LIMIT_KB * 0.95)) return 'memory_limit';
    return 'runtime_error';
  }
  return 'service_error'; // 13, 14 and anything unexpected
}

async function executeJudge0(input: ExecInput, onRunning: () => void): Promise<ExecOutcome> {
  const ids = await loadLanguageIds();
  const created = await j0<{ token?: string }>('/submissions?base64_encoded=true&wait=false', {
    method: 'POST',
    body: JSON.stringify({
      language_id: ids[input.language],
      source_code: b64(input.source),
      stdin: b64(input.stdin),
      cpu_time_limit: CPU_LIMIT_S,
      wall_time_limit: WALL_LIMIT_S,
      memory_limit: MEMORY_LIMIT_KB,
      ...(COMPILER_OPTIONS[input.language] ? { compiler_options: COMPILER_OPTIONS[input.language] } : {}),
    }),
  });
  if (!created.token) throw new ServiceError('The code runner did not accept the submission.');
  onRunning();
  const deadline = Date.now() + GIVE_UP_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const s = await j0<Judge0Submission>(`/submissions/${created.token}?base64_encoded=true`);
    if (s.status.id <= 2) continue;
    // C / C++ crashes come wrapped by the runner's shell script ("run.sh: line 1:  3 Segmentation fault ..."); drop the wrapper.
    const stderr = clean(unb64(s.stderr)).replace(/^run\.sh: line \d+:\s+\d+\s+/gm, '');
    const memoryKb = typeof s.memory === 'number' ? s.memory : undefined;
    const status = mapJudge0Status(s.status.id, stderr, memoryKb);
    if (status === 'service_error') throw new ServiceError(`The code runner failed (${s.status.description}). Try again.`);
    const time = s.time !== null ? Number.parseFloat(s.time) : NaN;
    return {
      status,
      stdout: clean(unb64(s.stdout)),
      stderr,
      compileOutput: clean(unb64(s.compile_output)),
      timeMs: Number.isFinite(time) ? Math.round(time * 1000) : undefined,
      memoryKb,
    };
  }
  throw new ServiceError('The code runner took too long to answer. Try again.');
}

// Local fallback: NOT sandboxed. Only used when JUDGE0_URL is empty or RUNNER=local. Keeps secrets out of the child's env.
const LOCAL_RUNNERS: Partial<Record<Lang, { file: string; command: () => string; args: string[] }>> = {
  python: {
    file: 'script.py',
    command: () => process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'python' : 'python3'),
    args: ['-X', 'utf8', '-I', 'script.py'],
  },
  javascript: { file: 'script.js', command: () => process.execPath, args: ['script.js'] },
};

/** Languages this server can run right now: all five through Judge0, only Python and JavaScript through the local runner. */
export function availableLanguages(): readonly Lang[] {
  return useJudge0() ? LANGUAGES : (Object.keys(LOCAL_RUNNERS) as Lang[]);
}

function executeLocal(input: ExecInput): Promise<ExecOutcome> {
  const runner = LOCAL_RUNNERS[input.language];
  if (!runner)
    return Promise.reject(new ServiceError(`${LANGUAGE_LABEL[input.language]} is not available on this server's demo runner.`));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-run-'));
  fs.writeFileSync(path.join(dir, runner.file), input.source, 'utf8');
  const env: NodeJS.ProcessEnv = {};
  // LOCALAPPDATA and USERPROFILE: the Windows Python launcher needs them, else it re-downloads a runtime on every run (7 s). No secrets in them.
  for (const k of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'LOCALAPPDATA', 'USERPROFILE', 'APPDATA', 'ProgramData', 'windir']) if (process.env[k]) env[k] = process.env[k];
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let out = '';
    let err = '';
    let timedOut = false;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      fn();
    };
    const child = spawn(runner.command(), runner.args, { cwd: dir, env, windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CPU_LIMIT_S * 1000);
    child.stdout.on('data', (d: Buffer) => {
      if (out.length < MAX_STDOUT_CHARS * 2) out += d.toString('utf8'); // past that: drain and drop; the 5 s limit ends runaway loops
    });
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < MAX_ERR_CHARS * 4) err += d.toString('utf8');
    });
    child.stdin.on('error', () => undefined); // program may exit without reading stdin
    child.stdin.end(input.stdin);
    child.on('error', () =>
      finish(() => reject(new ServiceError(`${LANGUAGE_LABEL[input.language]} could not be started on the server.`))),
    );
    child.on('close', (code) =>
      finish(() => {
        const stderr = clean(err);
        const timeMs = Date.now() - started;
        let status: RunStatus = 'success';
        if (timedOut) status = 'timeout';
        else if (code !== 0) status = mapJudge0Status(11, stderr); // same rule as Judge0: syntax errors are compile errors, the rest runtime
        resolve({ status, stdout: clean(out), stderr, compileOutput: '', timeMs });
      }),
    );
  });
}

// ---- pipeline ----------------------------------------------------------------------------------------
async function processRun(run: RunResult): Promise<void> {
  const language = run.language as Lang;
  // run.source stays exactly what the student wrote (line numbers are identical after the Java rename).
  const prepared = language === 'java' ? prepareJava(run.source) : { source: run.source, note: undefined };
  const input: ExecInput = { language, source: prepared.source, stdin: run.stdin };
  try {
    const out = useJudge0() ? await executeJudge0(input, () => void (run.status = 'running')) : await executeLocal(input);
    run.status = out.status;
    run.stdout = capHead(out.stdout, MAX_STDOUT_CHARS);
    run.stderr = capTail(out.stderr, MAX_ERR_CHARS);
    run.compileOutput = capTail((prepared.note ?? '') + out.compileOutput, MAX_ERR_CHARS);
    run.timeMs = out.timeMs;
    run.memoryKb = out.memoryKb;
  } catch (e) {
    run.status = 'service_error';
    run.stdout = '';
    run.stderr = e instanceof ServiceError ? e.message : 'The run failed inside the server. Try again.';
    run.compileOutput = '';
    if (!(e instanceof ServiceError)) console.error('[run] unexpected failure:', e instanceof Error ? e.message : e);
  }
  if (run.status !== 'service_error') {
    try {
      annotateError(run);
      logEvent({
        userId: run.ownerId,
        roomCode: run.roomCode,
        at: Date.now(),
        type: 'run',
        category: categoryOf(run),
        ok: run.status === 'success',
      });
    } catch (e) {
      console.error('[run] logEvent failed:', e instanceof Error ? e.message : e);
    }
  }
}

// ---- routes ---------------------------------------------------------------------------------------------
const runBody = z.object({
  roomCode: z.string().trim().min(1).max(64),
  language: z.enum(LANGUAGES).default('python'),
  source: z.string().max(MAX_SOURCE_CHARS),
  stdin: z.string().default(''),
});

export const router = Router();

router.get('/run-info', (_req, res) => {
  const judge0 = useJudge0();
  res.json({ runner: judge0 ? 'judge0' : 'local', sandboxed: judge0, languages: availableLanguages() });
});

router.post('/run', requireUser, (req, res) => {
  const parsed = runBody.safeParse(req.body);
  if (!parsed.success) {
    const unsupported =
      req.body && typeof req.body.language === 'string' && !(LANGUAGES as readonly string[]).includes(req.body.language);
    res
      .status(400)
      .json({
        error: unsupported ? `Language not supported (available: ${availableLanguages().join(', ')}).` : 'Invalid run request.',
      });
    return;
  }
  const { roomCode, language, source, stdin } = parsed.data;
  if (!availableLanguages().includes(language)) {
    res
      .status(400)
      .json({
        error: `${LANGUAGE_LABEL[language]} is not available on this server's demo runner (available: ${availableLanguages().join(', ')}).`,
      });
    return;
  }
  if (Buffer.byteLength(stdin, 'utf8') > MAX_STDIN_BYTES) {
    res.status(400).json({ error: 'Input is too large (limit 10 KB).' });
    return;
  }
  if (!source.trim()) {
    res.status(400).json({ error: 'There is no code to run.' });
    return;
  }
  const userId = req.user!.userId;
  const wait = admit(userId);
  if (wait) {
    res.status(429).json({ error: wait });
    return;
  }
  const run: RunResult = {
    id: randomUUID(),
    ownerId: userId,
    roomCode,
    language,
    source,
    stdin,
    status: 'queued',
    stdout: '',
    stderr: '',
    compileOutput: '',
    createdAt: Date.now(),
  };
  remember(run);
  res.status(202).json({ id: run.id });
  processRun(run)
    .catch((e) => {
      run.status = 'service_error';
      run.stderr = 'The run failed inside the server. Try again.';
      console.error('[run] unhandled:', e instanceof Error ? e.message : e);
    })
    .finally(() => release(userId));
});

function mayRead(viewerId: string, ownerId: string): boolean {
  return viewerId === ownerId || canView(viewerId, ownerId);
}

router.get('/run/:id', requireUser, (req, res) => {
  const run = getRun(String(req.params.id));
  if (!run) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  if (!mayRead(req.user!.userId, run.ownerId)) {
    res.status(403).json({ error: 'this run is private to its owner' });
    return;
  }
  res.json(run);
});

router.get('/runs/latest', requireUser, (req, res) => {
  const q = req.query.ownerId;
  const ownerId = typeof q === 'string' && q ? q : req.user!.userId;
  if (!mayRead(req.user!.userId, ownerId)) {
    res.status(403).json({ error: 'this run is private to its owner' });
    return;
  }
  res.json(getLatestRunFor(ownerId) ?? null);
});
