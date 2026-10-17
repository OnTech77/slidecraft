import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { badRequest } from '../utils/errors.js';
import { MAX_MARKDOWN_BYTES, decodeTextFile, sanitizeMarkdownInput, validateMarkdown } from '../utils/validation.js';
import { generatePresentation } from '../services/slideGenerator.js';

const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown']);
// Browsers and operating systems report Markdown files with many different MIME types.
const ALLOWED_MIME_TYPES = new Set(['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream', '']);

// Files are kept in memory only: they are parsed and discarded, never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MARKDOWN_BYTES, files: 1, fields: 5 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(badRequest('Only Markdown files (.md or .markdown) can be uploaded.', 'INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Keep only a short, harmless version of the uploaded file name for display. */
function displayName(originalName) {
  const base = path.basename(originalName).replace(/[^\w.\- ]+/g, '').trim();
  return (base || 'upload.md').slice(0, 100);
}

const sampleUrl = new URL('../../sample.md', import.meta.url);

export const slidesRouter = Router();

slidesRouter.post('/parse', (req, res) => {
  const markdown = validateMarkdown(req.body?.markdown, { required: false });
  res.json(generatePresentation(markdown, { theme: req.body?.theme }));
});

slidesRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    throw badRequest('Please choose a Markdown (.md) file to upload.', 'MISSING_FILE');
  }
  const markdown = sanitizeMarkdownInput(decodeTextFile(req.file.buffer));
  if (markdown.trim() === '') {
    throw badRequest('That file is empty. Please upload a file with some Markdown content.', 'EMPTY_FILE');
  }
  res.json({
    filename: displayName(req.file.originalname),
    markdown,
    presentation: generatePresentation(markdown, { theme: req.body?.theme }),
  });
});

slidesRouter.get('/sample', async (req, res) => {
  res.json({ markdown: await readFile(sampleUrl, 'utf8') });
});
