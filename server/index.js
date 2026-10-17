import 'dotenv/config';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Slidecraft API listening on http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
