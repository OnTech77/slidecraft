import { Router } from 'express';
import { DEFAULT_THEME, THEMES, getAllThemesCss } from '../themes/index.js';

export const themesRouter = Router();

themesRouter.get('/', (req, res) => {
  res.json({ themes: THEMES, defaultTheme: DEFAULT_THEME });
});

themesRouter.get('/styles.css', (req, res) => {
  res.type('text/css').set('Cache-Control', 'no-cache').send(getAllThemesCss());
});
