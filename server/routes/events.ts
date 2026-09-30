/**
 * Lane D (Miti): P-D2 learning events and progress. STUB from P-A1 - replace handlers, KEEP logEvent.
 *   GET /api/progress/me     -> aggregates and observations for the caller
 *   GET /api/progress/room   -> mentor table for the caller's room
 */
import { Router } from 'express';
import type { LearningEvent } from '@syncverse/shared';
import { notImplemented } from '../stub';

const events: LearningEvent[] = [];

/** Every lane calls this when something learning-relevant happens (run finished, explain asked, patch decided...). */
export function logEvent(e: LearningEvent): void {
  events.push(e);
}

export function getEvents(): readonly LearningEvent[] {
  return events;
}

export const router = Router();
router.get('/progress/me', notImplemented('P-D2'));
router.get('/progress/room', notImplemented('P-D2'));
