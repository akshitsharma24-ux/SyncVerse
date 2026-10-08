/**
 * Environment validation. Owner: Lane A.
 * validateEnv() runs once at startup (server/index.ts, after .env is loaded):
 *   - invalid values (a PORT that is not a number, a LIVEKIT_URL that is not a URL, ...) STOP the server with a clear message;
 *   - missing optional keys only switch a feature off, and are listed as a warning so nobody wonders why video/AI/run does nothing.
 * getEnvReport() feeds /api/health.
 */
import { z } from 'zod';
import { logger } from './logger';

const empty = (v: unknown) => (v === '' || v === null ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(empty, s.optional());
const flag = z.preprocess(empty, z.enum(['0', '1', 'true', 'false']).optional());

const schema = z.object({
  PORT: z.preprocess(empty, z.coerce.number().int().min(1).max(65535).default(4000)),
  NODE_ENV: opt(z.string()),
  LOG_LEVEL: z.preprocess(empty, z.enum(['debug', 'info', 'warn', 'error']).default('info')),
  LOG_RETENTION_DAYS: z.preprocess(empty, z.coerce.number().int().min(1).max(365).default(7)),
  LOG_TO_FILE: flag,
  AUTH_SECRET: opt(z.string().min(16, 'must be at least 16 characters')),
  REQUIRE_AUTH: flag,
  ADMIN_TOKEN: opt(z.string().min(12, 'must be at least 12 characters')),
  LIVEKIT_URL: opt(z.string().regex(/^(wss?|https?):\/\/[^\s/]+/i, 'must look like wss://your-project.livekit.cloud')),
  LIVEKIT_API_KEY: opt(z.string()),
  LIVEKIT_API_SECRET: opt(z.string()),
  JUDGE0_URL: opt(z.string().url('must be a full URL such as https://judge0-ce.p.rapidapi.com')),
  JUDGE0_API_KEY: opt(z.string()),
  LLM_API_KEY: opt(z.string()),
});

export interface EnvReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  features: { video: boolean; run: boolean; ai: boolean; accountsRequired: boolean };
}

let report: EnvReport = { ok: true, errors: [], warnings: [], features: { video: false, run: false, ai: false, accountsRequired: false } };

export function computeEnvReport(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${issue.path.join('.') || 'env'}: ${issue.message}`);
  }
  const v = parsed.success ? parsed.data : undefined;

  const lk = [env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET].map(Boolean);
  const video = lk.every(Boolean);
  if (!video) {
    warnings.push(
      lk.some(Boolean)
        ? 'LiveKit is only partly configured: set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET together. Video is off.'
        : 'LiveKit keys are not set: the video call is off.',
    );
  }
  const run = Boolean(env.JUDGE0_URL);
  if (!run) warnings.push('JUDGE0_URL is not set: running code is off.');
  const ai = Boolean(env.LLM_API_KEY);
  if (!ai) warnings.push('LLM_API_KEY is not set: AI explanations use the built-in answers only.');
  const accountsRequired = env.REQUIRE_AUTH === '1' || env.REQUIRE_AUTH === 'true';
  if (env.NODE_ENV === 'production') {
    if (!env.JUDGE0_URL || env.RUNNER === 'local') {
      errors.push('Production requires JUDGE0_URL and RUNNER must not be local: submitted code must run in a sandbox.');
    }
    if (!env.AUTH_SECRET) warnings.push('AUTH_SECRET is not set in production: a generated secret file is used. Set your own so logins survive moving servers.');
    if (!accountsRequired) warnings.push('REQUIRE_AUTH is off: anyone can join as a guest. Fine for a demo, not for real classes.');
  }
  if (accountsRequired && !v) warnings.push('REQUIRE_AUTH is on but the configuration has errors; fix them first.');
  return { ok: errors.length === 0, errors, warnings, features: { video, run, ai, accountsRequired } };
}

export function validateEnv(): EnvReport {
  const log = logger('env');
  report = computeEnvReport();
  for (const e of report.errors) log.error(`invalid setting ${e}`);
  for (const w of report.warnings) log.warn(w);
  if (!report.ok) {
    log.error('fix the settings above in .env (see .env.example) and start again');
    process.exit(1);
  }
  log.info('environment ok', report.features);
  return report;
}

export const getEnvReport = (): EnvReport => report;
export const accountsRequired = (): boolean => process.env.REQUIRE_AUTH === '1' || process.env.REQUIRE_AUTH === 'true';
