/**
 * Lane D (Miti): P-D1 permission-gated debug access. STUB from P-A1 - replace handlers, KEEP canView.
 *   POST /api/debug/request        {ownerId}        -> DebugGrant
 *   POST /api/debug/:id/decision   {allow:boolean}  -> DebugGrant
 *   POST /api/debug/:id/revoke                      -> DebugGrant
 *   GET  /api/debug/events         SSE, per user
 */
import { Router } from 'express';
import { notImplemented } from '../stub';

/** True when `viewerId` may read `ownerId`'s runs/explanations: the owner, or an active, unexpired grantee. */
export function canView(viewerId: string, ownerId: string): boolean {
  return viewerId === ownerId; // stub: owner only. P-D1 adds active grants.
}

export const router = Router();
router.post('/debug/request', notImplemented('P-D1'));
router.post('/debug/:id/decision', notImplemented('P-D1'));
router.post('/debug/:id/revoke', notImplemented('P-D1'));
router.get('/debug/events', notImplemented('P-D1'));
