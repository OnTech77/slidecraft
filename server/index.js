import 'dotenv/config';
import { createApp } from './app.js';
import { closeBrowser } from './services/exportService.js';

const PORT = Number(process.env.PORT) || 3001;

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Slidecraft API listening on http://localhost:${PORT}`);
});

async function shutdown() {
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
