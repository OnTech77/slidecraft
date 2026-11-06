import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { browserOnly } from './browserOnly.js';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3001';

const shim = (name) => fileURLToPath(new URL(`./src/browser/shims/${name}.js`, import.meta.url));

export default defineConfig(({ mode }) => {
  // `vite build --mode pages` makes the browser-only version for GitHub Pages (see browserOnly.js).
  const pages = mode === 'pages';
  return {
    plugins: [react(), pages && browserOnly()],
    // GitHub Pages serves the site from /<repository name>/.
    base: pages ? (process.env.PAGES_BASE ?? '/slidecraft/') : '/',
    resolve: pages ? { alias: { jsdom: shim('jsdom'), multer: shim('multer'), openai: shim('openai') } } : undefined,
    // A separate folder, so it never replaces the server's build in dist/.
    build: pages ? { outDir: 'dist-pages', emptyOutDir: true } : undefined,
    server: {
      port: 5173,
      // Forward API calls to the Express server so the browser only talks to one origin.
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
      },
    },
  };
});
