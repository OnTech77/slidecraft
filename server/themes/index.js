import { readFileSync } from 'node:fs';

/** Theme catalog. Each id has a matching <id>.css file in this folder. */
export const THEMES = [
  { id: 'default', name: 'Default', description: 'Clean and bright with an indigo accent.', colors: { bg: '#ffffff', fg: '#1f2937', accent: '#4f46e5' } },
  { id: 'midnight', name: 'Midnight', description: 'Deep navy gradient for dark rooms.', colors: { bg: '#0f172a', fg: '#f8fafc', accent: '#38bdf8' } },
  { id: 'corporate', name: 'Corporate', description: 'Crisp and professional with a navy band.', colors: { bg: '#ffffff', fg: '#0b3d74', accent: '#0b5cad' } },
  { id: 'sunset', name: 'Sunset', description: 'Warm peach-to-rose gradient.', colors: { bg: '#fff1eb', fg: '#9a3412', accent: '#ea580c' } },
  { id: 'editorial', name: 'Editorial', description: 'Serif headings on warm paper.', colors: { bg: '#faf7f2', fg: '#1a1a1a', accent: '#b91c1c' } },
];

export const DEFAULT_THEME = 'default';

const THEME_IDS = new Set(THEMES.map((t) => t.id));

export function isValidTheme(id) {
  return typeof id === 'string' && THEME_IDS.has(id);
}

const readCss = (name) => readFileSync(new URL(`./${name}.css`, import.meta.url), 'utf8');

// Theme files are small and only change during development, so read them once at startup.
const BASE_CSS = readCss('base');
const THEME_CSS = Object.fromEntries(THEMES.map((t) => [t.id, readCss(t.id)]));

/** CSS for one theme (base + theme variables), used for exports. */
export function getThemeCss(id) {
  return `${BASE_CSS}\n${THEME_CSS[isValidTheme(id) ? id : DEFAULT_THEME]}`;
}

/** CSS for every theme, used by the client preview so switching themes is instant. */
export function getAllThemesCss() {
  return [BASE_CSS, ...THEMES.map((t) => THEME_CSS[t.id])].join('\n');
}
