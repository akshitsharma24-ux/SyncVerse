/** Placeholder handler for routes whose task has not landed yet. Delete the usage when you implement the route. */
import type { Request, Response } from 'express';

export function notImplemented(task: string) {
  return (_req: Request, res: Response): void => {
    res.status(501).json({ error: 'not implemented yet', task });
  };
}
