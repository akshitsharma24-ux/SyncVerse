/**
 * Server entry. Owner: Lane A. After P-A1 this file does NOT change: every lane works inside its own
 * routes/*.ts file, which is already mounted below.
 */
import path from 'node:path';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { identity } from './identity';
import { attachCollab, collabStats } from './collab';
import { router as runRouter } from './routes/run';
import { router as analyzeRouter } from './routes/analyze';
import { router as aiRouter } from './routes/ai';
import { router as debugRouter } from './routes/debug';
import { router as eventsRouter } from './routes/events';
import { router as livekitRouter } from './routes/livekit';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(identity);

app.get('/api/health', (_req, res) => {
  const has = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]));
  res.json({
    ok: true,
    time: Date.now(),
    configured: {
      judge0: has('JUDGE0_URL'),
      llm: has('LLM_API_KEY'),
      livekit: has('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'),
    },
    collab: collabStats(),
  });
});

app.use('/api', runRouter);
app.use('/api', analyzeRouter);
app.use('/api', aiRouter);
app.use('/api', debugRouter);
app.use('/api', eventsRouter);
app.use('/api', livekitRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'unknown route' });
});

const server = createServer(app);
attachCollab(server);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on http://localhost:${port}  (health: /api/health)`);
});
