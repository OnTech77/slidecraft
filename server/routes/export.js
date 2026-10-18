import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { badRequest } from '../utils/errors.js';
import { validateMarkdown } from '../utils/validation.js';
import { generatePresentation } from '../services/slideGenerator.js';
import { exportFilename, exportPdf } from '../services/exportService.js';
import { buildJson, buildMarkdown, buildStandaloneHtml } from '../services/formatExports.js';

// Rendering a PDF starts a Chrome tab, so keep the request rate reasonable.
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many exports at once. Please wait a minute and try again.' } });
  },
});

export const EXPORT_FORMATS = {
  pdf: { extension: 'pdf', contentType: 'application/pdf', build: exportPdf },
  html: { extension: 'html', contentType: 'text/html; charset=utf-8', build: buildStandaloneHtml },
  md: { extension: 'md', contentType: 'text/markdown; charset=utf-8', build: buildMarkdown },
  json: { extension: 'json', contentType: 'application/json; charset=utf-8', build: buildJson },
};

export const exportRouter = Router();

exportRouter.post('/:format', exportLimiter, async (req, res) => {
  const format = Object.hasOwn(EXPORT_FORMATS, req.params.format) ? EXPORT_FORMATS[req.params.format] : null;
  if (!format) {
    throw badRequest('That export format is not available. Choose PDF, HTML, Markdown or JSON.', 'UNSUPPORTED_FORMAT');
  }
  const markdown = validateMarkdown(req.body?.markdown);
  const presentation = generatePresentation(markdown, { theme: req.body?.theme, transition: req.body?.transition });
  if (!presentation.slides.length) {
    throw badRequest('There are no slides to export yet. Add some Markdown content first.', 'NO_SLIDES');
  }
  const file = await format.build(presentation);

  res
    .type(format.contentType)
    .set('Content-Disposition', `attachment; filename="${exportFilename(req.body?.filename || presentation.title, format.extension)}"`)
    .send(file);
});
