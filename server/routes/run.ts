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

const LANGUAGES = ['python'] as const; // P-B5 adds c | cpp | java | javascript

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

/** Name of the exception on the last line of a Python-style error, e.g. "IndexError". */
export function errorKind(stderr: string): string | undefined {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^([A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning))\b/.exec(lines[i]);
    if (m) return m[1].split('.').pop();
  }
  return undefined;
}

// ---- runner interface ----------------------------------------------------------------------------
interface ExecInput {
  language: (typeof LANGUAGES)[number];
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

// Judge0 language ids differ between instances, so read GET /languages once and map by name.
let languageIds: Promise<Record<string, number>> | null = null;

function loadLanguageIds(): Promise<Record<string, number>> {
  if (!languageIds) {
    languageIds = j0<{ id: number; name: string }[]>('/languages').then((list) => {
      const py = list.filter((l) => /^Python \(3\./.test(l.name));
      const pick = py.find((l) => l.name.startsWith('Python (3.12')) ?? py.sort((a, b) => b.name.localeCompare(a.name))[0];
      return { python: pick?.id ?? 71 };
    });
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
    }),
  });
  if (!created.token) throw new ServiceError('The code runner did not accept the submission.');
  onRunning();
  const deadline = Date.now() + GIVE_UP_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const s = await j0<Judge0Submission>(`/submissions/${created.token}?base64_encoded=true`);
    if (s.status.id <= 2) continue;
    const stderr = clean(unb64(s.stderr));
    const memoryKb = typeof s.memory === 'number' ? s.memory : undefined;
    const status = mapJudge0Status(s.status.id, stderr, memoryKb);
    if (status === 'service_error') throw new ServiceError(`The code runner failed (${s.status.description}). Try again.`);
    const time = s.time !== null ? Number.parseFloat(s.time) : NaN;
    return {
      status,
      stdout: clean(unb64(s.stdout)),
      stderr,
      compileOutput: clean(unb64(s.compile_output)) || (status === 'runtime_error' ? clean(unb64(s.message)) : ''),
      timeMs: Number.isFinite(time) ? Math.round(time * 1000) : undefined,
      memoryKb,
    };
  }
  throw new ServiceError('The code runner took too long to answer. Try again.');
}

// Local fallback: NOT sandboxed. Only used when JUDGE0_URL is empty or RUNNER=local. Keeps secrets out of the child's env.
function executeLocal(input: ExecInput): Promise<ExecOutcome> {
  const py = process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'python' : 'python3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-run-'));
  fs.writeFileSync(path.join(dir, 'script.py'), input.source, 'utf8');
  const env: NodeJS.ProcessEnv = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME']) if (process.env[k]) env[k] = process.env[k];
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
    const child = spawn(py, ['-X', 'utf8', '-I', 'script.py'], { cwd: dir, env, windowsHide: true });
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
    child.on('error', () => finish(() => reject(new ServiceError('Python could not be started on the server.'))));
    child.on('close', (code) =>
      finish(() => {
        const stderr = clean(err);
        const timeMs = Date.now() - started;
        let status: RunStatus = 'success';
        if (timedOut) status = 'timeout';
        else if (code !== 0) status = /\b(SyntaxError|IndentationError|TabError)\b/.test(stderr) ? 'compile_error' : 'runtime_error';
        resolve({ status, stdout: clean(out), stderr, compileOutput: '', timeMs });
      }),
    );
  });
}

// ---- pipeline ----------------------------------------------------------------------------------------
async function processRun(run: RunResult): Promise<void> {
  const input: ExecInput = { language: run.language as ExecInput['language'], source: run.source, stdin: run.stdin };
  try {
    const out = useJudge0() ? await executeJudge0(input, () => void (run.status = 'running')) : await executeLocal(input);
    run.status = out.status;
    run.stdout = capHead(out.stdout, MAX_STDOUT_CHARS);
    run.stderr = capTail(out.stderr, MAX_ERR_CHARS);
    run.compileOutput = capTail(out.compileOutput, MAX_ERR_CHARS);
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
      const kind = run.status === 'success' ? 'success' : run.status === 'timeout' || run.status === 'memory_limit' ? run.status : (errorKind(run.stderr) ?? run.status);
      logEvent({ userId: run.ownerId, roomCode: run.roomCode, at: Date.now(), type: 'run', category: kind, ok: run.status === 'success' });
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
  res.json({ runner: judge0 ? 'judge0' : 'local', sandboxed: judge0, languages: LANGUAGES });
});

router.post('/run', requireUser, (req, res) => {
  const parsed = runBody.safeParse(req.body);
  if (!parsed.success) {
    const unsupported = req.body && typeof req.body.language === 'string' && !(LANGUAGES as readonly string[]).includes(req.body.language);
    res.status(400).json({ error: unsupported ? `Language not supported yet (available: ${LANGUAGES.join(', ')}).` : 'Invalid run request.' });
    return;
  }
  const { roomCode, language, source, stdin } = parsed.data;
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
