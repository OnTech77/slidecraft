import { createApp } from '../app.js';

/** Start the app on a random port and return its base URL plus a close function. */
export async function startTestServer(options) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
