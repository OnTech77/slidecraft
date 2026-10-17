import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './utils/errors.js';
import { slidesRouter } from './routes/slides.js';
import { themesRouter } from './routes/themes.js';
import { aiRouter } from './routes/ai.js';
import { exportRouter } from './routes/export.js';

export const BODY_LIMIT = '10mb';

const CLIENT_DIST = fileURLToPath(new URL('../client/dist', import.meta.url));

/** Build the Express app. Kept separate from index.js so tests can start it on any port. */
export function createApp({ clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Slides may reference images hosted elsewhere.
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/slides', slidesRouter);
  app.use('/api/themes', themesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/export', exportRouter);

  app.use('/api', notFoundHandler);

  // In production, serve the built React app from the same server.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
