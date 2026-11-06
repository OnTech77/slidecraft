import { fileURLToPath } from 'node:url';

/**
 * Vite plugin for the GitHub Pages build (`vite build --mode pages`): a version of the app that
 * runs entirely in the browser, with no server.
 *
 * - Imports of src/services/api.js get src/browser/api.js instead, which runs the server's
 *   slide code in the page.
 * - server/themes/index.js reads CSS files with Node's fs, so it becomes a module that has the
 *   same exports with the CSS built in, taken from the real module at build time.
 * - The theme stylesheet the server normally serves at /api/themes/styles.css is written out
 *   as themes.css.
 */
const file = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const SERVER_API = file('./src/services/api.js');
const BROWSER_API = file('./src/browser/api.js');
const THEMES_MODULE = file('../server/themes/index.js');
const VIRTUAL_THEMES = '\0slidecraft-themes';
const THEME_LINK = /<link rel="stylesheet" href="\/api\/themes\/styles\.css" \/>/;

const loadThemes = () => import(new URL('../server/themes/index.js', import.meta.url));

export function browserOnly() {
  let base = '/';
  return {
    name: 'slidecraft-browser-only',
    enforce: 'pre',

    configResolved(config) {
      base = config.base;
    },

    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved?.id === SERVER_API && importer !== BROWSER_API) return BROWSER_API;
      if (resolved?.id === THEMES_MODULE) return VIRTUAL_THEMES;
      return null;
    },

    async load(id) {
      if (id !== VIRTUAL_THEMES) return null;
      const { THEMES, DEFAULT_THEME, getThemeCss, getAllThemesCss } = await loadThemes();
      const css = Object.fromEntries(THEMES.map((t) => [t.id, getThemeCss(t.id)]));
      return `export const THEMES = ${JSON.stringify(THEMES)};
export const DEFAULT_THEME = ${JSON.stringify(DEFAULT_THEME)};
const CSS = ${JSON.stringify(css)};
export const isValidTheme = (id) => typeof id === 'string' && Object.hasOwn(CSS, id);
export const getThemeCss = (id) => CSS[isValidTheme(id) ? id : DEFAULT_THEME];
export const getAllThemesCss = () => ${JSON.stringify(getAllThemesCss())};
`;
    },

    transformIndexHtml: {
      // Before Vite looks for the files index.html links to.
      order: 'pre',
      handler(html) {
        if (!THEME_LINK.test(html)) throw new Error('index.html no longer links /api/themes/styles.css; update browserOnly.js');
        return html.replace(THEME_LINK, `<link rel="stylesheet" href="${base}themes.css" vite-ignore />`);
      },
    },

    async generateBundle() {
      const { getAllThemesCss } = await loadThemes();
      this.emitFile({ type: 'asset', fileName: 'themes.css', source: getAllThemesCss() });
    },
  };
}
