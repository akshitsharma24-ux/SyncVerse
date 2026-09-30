/**
 * Lane B (Simrit): P-B1 run pipeline. STUB from P-A1 - replace the handlers, KEEP the exports.
 *   POST /api/run            -> { id }
 *   GET  /api/run/:id        -> RunResult (owner or active grantee via canView, else 403)
 *   GET  /api/runs/latest    -> RunResult | null   (?ownerId=)
 */
import { Router } from 'express';
import type { RunResult } from '@syncverse/shared';
import { notImplemented } from '../stub';

const runs = new Map<string, RunResult>();

export function getRun(id: string): RunResult | undefined {
  return runs.get(id);
}

export function getLatestRunFor(ownerId: string): RunResult | undefined {
  let latest: RunResult | undefined;
  for (const r of runs.values()) {
    if (r.ownerId === ownerId && (!latest || r.createdAt > latest.createdAt)) latest = r;
  }
  return latest;
}

export const router = Router();
router.post('/run', notImplemented('P-B1'));
router.get('/run/:id', notImplemented('P-B1'));
router.get('/runs/latest', notImplemented('P-B1'));
