/**
 * Lane C (Rahil): P-C1 LLM gateway, explain and patch. STUB from P-A1.
 *   POST /api/ai/explain {runId} -> Explanation   (owner or active grantee only)
 *   POST /api/ai/patch   {runId} -> { patchedSource }
 */
import { Router } from 'express';
import { notImplemented } from '../stub';

export const router = Router();
router.post('/ai/explain', notImplemented('P-C1'));
router.post('/ai/patch', notImplemented('P-C3'));
