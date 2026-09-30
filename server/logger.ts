/**
 * Central logging. Owner: Lane A.
 *   const log = logger('rooms');  log.info('room created', { code });  log.error('save failed', err);
 * One line per event, in this order of preference: JSON (NODE_ENV=production or LOG_FORMAT=json) or a readable line in dev.
 * Every line also goes to server/data/logs/syncverse-YYYY-MM-DD.log (JSON, kept LOG_RETENTION_DAYS days, default 7;
 * LOG_TO_FILE=0 turns the file off) and into a 500-line in-memory ring, readable at GET /api/admin/logs when ADMIN_TOKEN is set.
 * Secrets are redacted: any field named like password, token, secret, authorization or api key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { dataDir } from './paths';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogLine {
  t: string;
  level: Level;
  scope: string;
  msg: string;
  [field: string]: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const LOG_DIR = () => process.env.LOG_DIR || path.join(dataDir(), 'logs');
const ring: LogLine[] = [];
const RING_MAX = 500;

const minLevel = (): number => RANK[(process.env.LOG_LEVEL as Level) in RANK ? (process.env.LOG_LEVEL as Level) : 'info'];
const asJson = () => process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json';
const toFile = () => process.env.LOG_TO_FILE !== '0';

const SECRET_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;

function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.split('\n').slice(0, 6).join('\n') };
  if (value === null || typeof value !== 'object') return typeof value === 'string' && value.length > 500 ? value.slice(0, 500) + '...' : value;
  if (depth >= 3) return '[object]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

// ------------------------------------------------------------------------------------------ file sink
let stream: fs.WriteStream | null = null;
let streamDay = '';

function sink(): fs.WriteStream | null {
  if (!toFile()) return null;
  const day = new Date().toISOString().slice(0, 10);
  if (stream && streamDay === day) return stream;
  try {
    fs.mkdirSync(LOG_DIR(), { recursive: true });
    stream?.end();
    stream = fs.createWriteStream(path.join(LOG_DIR(), `syncverse-${day}.log`), { flags: 'a' });
    stream.on('error', () => {
      stream = null; // never let logging take the server down
    });
    streamDay = day;
    pruneOld();
    return stream;
  } catch {
    return null;
  }
}

function pruneOld(): void {
  const keepDays = Math.max(1, Number(process.env.LOG_RETENTION_DAYS) || 7);
  const cutoff = Date.now() - keepDays * 86_400_000;
  try {
    for (const f of fs.readdirSync(LOG_DIR())) {
      if (!/^syncverse-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
      const full = path.join(LOG_DIR(), f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------- core
function write(level: Level, scope: string, msg: string, fields?: unknown): void {
  if (RANK[level] < minLevel()) return;
  const extra = fields instanceof Error ? { error: redact(fields) } : (redact(fields ?? {}) as Record<string, unknown>);
  const line: LogLine = { t: new Date().toISOString(), level, scope, msg, ...(typeof extra === 'object' && extra ? extra : {}) };
  ring.push(line);
  if (ring.length > RING_MAX) ring.shift();
  const json = JSON.stringify(line);
  sink()?.write(json + '\n');
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (asJson()) {
    out(json);
  } else {
    const { t, level: _l, scope: _s, msg: _m, ...rest } = line;
    const tail = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    out(`${t.slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${scope.padEnd(7)} ${msg}${tail}`);
  }
}

export interface Logger {
  debug(msg: string, fields?: unknown): void;
  info(msg: string, fields?: unknown): void;
  warn(msg: string, fields?: unknown): void;
  error(msg: string, fields?: unknown): void;
}

export function logger(scope: string): Logger {
  return {
    debug: (m, f) => write('debug', scope, m, f),
    info: (m, f) => write('info', scope, m, f),
    warn: (m, f) => write('warn', scope, m, f),
    error: (m, f) => write('error', scope, m, f),
  };
}

export function recentLogs(limit = 100, minimum: Level = 'debug'): LogLine[] {
  return ring.filter((l) => RANK[l.level] >= RANK[minimum]).slice(-Math.min(Math.max(limit, 1), RING_MAX));
}

// ------------------------------------------------------------------------------------- http plumbing
const httpLog = logger('http');

/** Adds an x-request-id to every response and logs one line per request when it finishes. */
export const requestLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const id = (req.header('x-request-id') ?? '').slice(0, 40) || randomUUID().slice(0, 8);
  req.id = id;
  res.setHeader('x-request-id', id);
  const start = process.hrtime.bigint();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    const status = res.statusCode;
    const level: Level = status >= 500 ? 'error' : status >= 400 ? 'warn' : req.path === '/health' || req.path === '/api/health' ? 'debug' : 'info';
    write(level, 'http', `${req.method} ${req.originalUrl.split('?')[0]} ${status} ${ms}ms`, { id, user: req.user?.userId });
  };
  res.on('finish', finish);
  res.on('close', finish);
  next();
};

/** Last line of defence: turns any thrown error into a JSON answer and a log line (never an HTML stack trace). */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) write('error', 'http', `unhandled error on ${req.method} ${req.path}`, { id: req.id, error: err });
  if (res.headersSent) return;
  res.status(status).json({
    error: status === 400 ? 'bad_request' : status === 413 ? 'too_large' : status >= 500 ? 'internal_error' : 'error',
    message: status >= 500 ? 'Something went wrong on the server.' : String(err?.message ?? 'Bad request'),
    requestId: req.id,
  });
};

export function installProcessHandlers(): void {
  const log = logger('process');
  process.on('unhandledRejection', (reason) => log.error('unhandled promise rejection', reason instanceof Error ? reason : { reason: String(reason) }));
  process.on('uncaughtException', (err) => {
    log.error('uncaught exception', err);
  });
}
