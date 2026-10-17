import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './utils/errors.js';

export const BODY_LIMIT = '10mb';

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

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
