/**
 * Server entry. Owner: Lane A. Every lane works inside its own routes/*.ts file, which is already mounted below.
 * Order matters: request log -> JSON body -> identity (account token or guest headers) -> routes -> 404 -> error handler.
 */
import path from 'node:path';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { validateEnv, getEnvReport } from './env';
import { errorHandler, installProcessHandlers, logger, requestLogger } from './logger';
import { identity } from './identity';
import { accountCount, router as authRouter } from './auth';
import { attachCollab, collabStats } from './collab';
import { router as roomsRouter } from './routes/rooms';
import { router as opsRouter } from './routes/ops';
import { router as runRouter } from './routes/run';
import { router as analyzeRouter } from './routes/analyze';
import { router as aiRouter } from './routes/ai';
import { router as debugRouter } from './routes/debug';
import { router as eventsRouter } from './routes/events';
import { router as livekitRouter } from './routes/livekit';

installProcessHandlers();
validateEnv();
const log = logger('server');

const app = express();
app.set('trust proxy', 'loopback'); // behind the Vite dev proxy or a reverse proxy on the same machine
app.use(requestLogger);
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
    accounts: accountCount(),
    accountsRequired: getEnvReport().features.accountsRequired,
  });
});

app.use('/api', authRouter);
app.use('/api', roomsRouter);
app.use('/api', opsRouter);

app.use('/api', runRouter);
app.use('/api', analyzeRouter);
app.use('/api', aiRouter);
app.use('/api', debugRouter);
app.use('/api', eventsRouter);
app.use('/api', livekitRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'unknown route' });
});
app.use(errorHandler);

const server = createServer(app);
attachCollab(server);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, '0.0.0.0', () => {
  log.info(`listening on http://localhost:${port}  (health: /api/health)`);
});
