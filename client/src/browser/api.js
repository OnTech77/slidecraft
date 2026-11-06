/**
 * Browser-only replacement for services/api.js, used by the GitHub Pages build
 * (`npm run build:pages`), where there is no server. It offers the same `api` methods, but
 * does the work in the page by running the server's own code: the same parser, layouts,
 * themes, exports and AI prompts, so slides come out exactly as they do with the server.
 *
 * Differences from the server version:
 * - PDF export opens the browser's print dialog (choose "Save as PDF") instead of a download.
 * - AI only uses Ollama on the visitor's own computer. Online AI would need an API key in the
 *   page, where anyone could copy it.
 */
import './process.js';
import sampleMarkdown from '../../../sample.md?raw';
import { ApiError, isAbortError, MAX_UPLOAD_BYTES } from '../services/api.js';
import { AppError, badRequest } from '../../../server/utils/errors.js';
import { MAX_MARKDOWN_BYTES, decodeTextFile, sanitizeMarkdownInput } from '../../../server/utils/validation.js';
import { DEFAULT_THEME, THEMES } from '../../../server/themes/index.js';
import { buildPresentationHtml, generatePresentation } from '../../../server/services/slideGenerator.js';
import { buildJson, buildMarkdown, buildStandaloneHtml } from '../../../server/services/formatExports.js';
import { enhanceMarkdown, getProviderStatus, listActions } from '../../../server/services/aiService.js';

export { ApiError, isAbortError, MAX_UPLOAD_BYTES };

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_TIMEOUT_MS = 300_000;
const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown']);
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const ONLINE_AI_REASON =
  'Online AI needs a private API key, which can’t be kept secret in a public web page. Use Local model (Ollama), or SlideCraft on your own computer.';

const ollamaSetupReason = () =>
  `Can’t reach Ollama on this computer. Make sure it is running and allows this site: in Terminal run launchctl setenv OLLAMA_ORIGINS "${window.location.origin}", then quit and reopen Ollama.`;

/** Turn an error from the server code into the ApiError the UI expects. */
function toApiError(err) {
  if (err instanceof ApiError || isAbortError(err)) return err;
  if (err instanceof AppError) return new ApiError(err.message, { code: err.code, status: err.status });
  console.error('[slidecraft]', err);
  return new ApiError(GENERIC_MESSAGE);
}

/** Run some of the server code and report its errors the way the server would. */
async function run(work) {
  try {
    return await work();
  } catch (err) {
    throw toApiError(err);
  }
}

/** Same checks as the server's validateMarkdown, without Node's Buffer. */
function cleanMarkdown(value, { required = true } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw badRequest('Please add some Markdown content first.', 'MISSING_CONTENT');
    return '';
  }
  if (typeof value !== 'string') throw badRequest('Markdown content must be text.', 'INVALID_CONTENT');
  if (new TextEncoder().encode(value).length > MAX_MARKDOWN_BYTES) {
    throw new AppError(413, 'CONTENT_TOO_LARGE', 'Your content is too large. The maximum size is 10 MB.');
  }
  return sanitizeMarkdownInput(value);
}

/** Keep only a short, harmless version of the uploaded file name for display. */
const displayName = (name) => (name.replace(/[^\w.\- ]+/g, '').trim() || 'upload.md').slice(0, 100);

/**
 * An OpenAI-style client that sends chat requests straight to Ollama from the browser.
 * Errors are shaped like the SDK's, so aiService's friendly error messages still apply.
 */
function ollamaClient(signal) {
  const create = async (body) => {
    const timeout = AbortSignal.timeout(OLLAMA_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw Object.assign(new Error(err.message), { name: timeout.aborted ? 'APIConnectionTimeoutError' : 'APIConnectionError' });
    }
    if (!response.ok) throw Object.assign(new Error(`Ollama answered ${response.status}`), { status: response.status });
    return response.json();
  };
  return { chat: { completions: { create } } };
}

const EXPORT_BUILDERS = {
  html: { build: buildStandaloneHtml, type: 'text/html;charset=utf-8' },
  md: { build: buildMarkdown, type: 'text/markdown;charset=utf-8' },
  json: { build: buildJson, type: 'application/json;charset=utf-8' },
};

// Like the server's PDF renderer (printBackground): keep slide backgrounds and colours in print.
const PRINT_CSS = '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Print the deck from a hidden frame, one 1280x720 page per slide, so "Save as PDF" gives the
 * same pages as the server's PDF. The frame runs no scripts. Its title becomes the PDF's name.
 */
function printDeck(presentation, filename) {
  const title = `<title>${escapeHtml(filename.replace(/\.pdf$/i, ''))}</title>`;
  const html = buildPresentationHtml(presentation, { extraCss: PRINT_CSS }).replace(/<title>[\s\S]*?<\/title>/, title);
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  return new Promise((resolve, reject) => {
    frame.addEventListener(
      'load',
      () => {
        const view = frame.contentWindow;
        // Some browsers return from print() at once, so wait for the dialog to close.
        const cleanUp = () => setTimeout(() => frame.remove(), 500);
        view.addEventListener('afterprint', cleanUp, { once: true });
        setTimeout(cleanUp, 10 * 60_000);
        try {
          view.focus();
          view.print();
          resolve();
        } catch (err) {
          frame.remove();
          reject(err);
        }
      },
      { once: true },
    );
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

export const api = {
  getThemes: () => run(() => ({ themes: THEMES, defaultTheme: DEFAULT_THEME })),

  getAIStatus: () =>
    run(async () => {
      const providers = (await getProviderStatus()).map((p) => {
        if (p.id === 'openai') return { ...p, available: false, reason: ONLINE_AI_REASON };
        if (!p.available && !/ollama pull/.test(p.reason ?? '')) return { ...p, reason: ollamaSetupReason() };
        return p;
      });
      return { configured: providers.some((p) => p.available), defaultProvider: 'ollama', providers, actions: listActions() };
    }),

  getSample: () => run(() => ({ markdown: sampleMarkdown })),

  parseMarkdown: (markdown) => run(() => generatePresentation(cleanMarkdown(markdown, { required: false }))),

  uploadFile: (file) =>
    run(async () => {
      const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw badRequest('Only Markdown files (.md or .markdown) can be uploaded.', 'INVALID_FILE_TYPE');
      }
      if (file.size > MAX_MARKDOWN_BYTES) {
        throw new AppError(413, 'LIMIT_FILE_SIZE', 'That file is too large. The maximum size is 10 MB.');
      }
      const markdown = sanitizeMarkdownInput(decodeTextFile(new Uint8Array(await file.arrayBuffer())));
      if (markdown.trim() === '') {
        throw badRequest('That file is empty. Please upload a file with some Markdown content.', 'EMPTY_FILE');
      }
      return { filename: displayName(file.name), markdown, presentation: generatePresentation(markdown) };
    }),

  enhance: (markdown, action, { provider, slide, instruction, signal } = {}) =>
    run(async () => {
      if (provider === 'openai') throw new AppError(503, 'AI_NOT_CONFIGURED', ONLINE_AI_REASON);
      try {
        return await enhanceMarkdown(cleanMarkdown(markdown), action, { provider: 'ollama', slide, instruction, client: ollamaClient(signal) });
      } catch (err) {
        if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
        if (err?.code === 'AI_UNREACHABLE') throw new AppError(502, err.code, ollamaSetupReason());
        throw err;
      }
    }),

  /** Returns the file as a Blob, or null for PDF, which opens the print dialog instead. */
  exportDeck: (format, { markdown, theme, transition, filename }) =>
    run(async () => {
      if (format !== 'pdf' && !Object.hasOwn(EXPORT_BUILDERS, format)) {
        throw badRequest('That export format is not available. Choose PDF, HTML, Markdown or JSON.', 'UNSUPPORTED_FORMAT');
      }
      const presentation = generatePresentation(cleanMarkdown(markdown), { theme, transition });
      if (!presentation.slides.length) {
        throw badRequest('There are no slides to export yet. Add some Markdown content first.', 'NO_SLIDES');
      }
      if (format === 'pdf') {
        await printDeck(presentation, filename ?? 'presentation.pdf');
        return null;
      }
      const { build, type } = EXPORT_BUILDERS[format];
      return new Blob([build(presentation)], { type });
    }),
};
