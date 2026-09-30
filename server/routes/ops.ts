/**
 * Lane A: operations. Browser error reports and (when ADMIN_TOKEN is set) the recent server log.
 *   POST /api/client-log            { message, stack?, where? }     the web app reports its own crashes here (rate limited)
 *   GET  /api/admin/logs?limit=&level=   header x-admin-token       last lines from the in-memory log ring
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { logger, recentLogs, type Level } from '../logger';

const log = logger('web');
export const router = Router();

const hits = new Map<string, { n: number; since: number }>();
const PER_MINUTE = 20;

router.post('/client-log', (req, res) => {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > 60_000) hits.set(ip, { n: 1, since: now });
  else if (++h.n > PER_MINUTE) return void res.status(429).json({ error: 'rate_limited' });
  const parsed = z
    .object({ message: z.string().max(500), stack: z.string().max(2000).optional(), where: z.string().max(200).optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: 'invalid' });
  log.warn(parsed.data.message, { where: parsed.data.where, stack: parsed.data.stack, user: req.user?.userId });
  res.status(204).end();
});

router.get('/admin/logs', (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  const given = req.header('x-admin-token') ?? '';
  const ok = Boolean(token) && given.length === token!.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token!));
  if (!ok) return void res.status(404).json({ error: 'unknown route' }); // do not reveal that the endpoint exists
  const level = (['debug', 'info', 'warn', 'error'] as const).find((l) => l === req.query.level) as Level | undefined;
  res.json({ logs: recentLogs(Number(req.query.limit) || 100, level) });
});
