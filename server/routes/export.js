import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { badRequest } from '../utils/errors.js';
import { validateMarkdown } from '../utils/validation.js';
import { generatePresentation } from '../services/slideGenerator.js';
import { exportPdf, pdfFilename } from '../services/exportService.js';

// Rendering a PDF starts a Chrome tab, so keep the request rate reasonable.
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many exports at once. Please wait a minute and try again.' } });
  },
});

export const exportRouter = Router();

exportRouter.post('/:format', exportLimiter, async (req, res) => {
  if (req.params.format !== 'pdf') {
    throw badRequest('Only PDF export is available right now.', 'UNSUPPORTED_FORMAT');
  }
  const markdown = validateMarkdown(req.body?.markdown);
  const presentation = generatePresentation(markdown, { theme: req.body?.theme });
  const pdf = await exportPdf(presentation);

  res
    .type('application/pdf')
    .set('Content-Disposition', `attachment; filename="${pdfFilename(req.body?.filename || presentation.title)}"`)
    .send(pdf);
});
