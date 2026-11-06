import puppeteer from 'puppeteer';
import { AppError, badRequest } from '../utils/errors.js';
import { buildPresentationHtml } from './slideGenerator.js';

const RENDER_TIMEOUT_MS = 30_000;

// Some hosts (such as Render) lack the kernel features Chrome's sandbox needs, and set
// CHROME_NO_SANDBOX=1 so Chrome can start. Slides render with JavaScript off and can only load
// data: URLs and public https: resources (see isAllowedResource), which limits the risk.
const CHROME_ARGS = [
  '--disable-dev-shm-usage',
  ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
];

let browserPromise = null;

/** Launch Chrome once and reuse it; relaunch if it crashes or fails to start. */
function getBrowser() {
  browserPromise ??= puppeteer
    .launch({ headless: true, args: CHROME_ARGS })
    .then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      browserPromise = null;
      console.error('[exportService] Could not launch Chrome:', err);
      throw new AppError(503, 'EXPORT_UNAVAILABLE', 'PDF export is unavailable right now. Please try again later.');
    });
  return browserPromise;
}

export async function closeBrowser() {
  const pending = browserPromise;
  browserPromise = null;
  if (pending) {
    try {
      await (await pending).close();
    } catch {
      // Already closed or never started.
    }
  }
}

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.(localhost|local|internal)$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?(::1?|f[cd][0-9a-f]{0,2}:.*|fe80:.*)\]?$/i,
];

/**
 * Decide whether the PDF renderer may load a URL. Only inline data and public HTTPS
 * resources (e.g. images) are allowed, so a deck cannot make the server fetch local files
 * or internal network addresses. Hostnames are checked as written, not after DNS lookup.
 */
export function isAllowedResource(url) {
  if (url.startsWith('data:') || url === 'about:blank') return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return !PRIVATE_HOST.some((pattern) => pattern.test(parsed.hostname));
}

/**
 * Render a presentation to a PDF with one 1280x720 page per slide.
 * @returns {Promise<Buffer>}
 */
export async function exportPdf(presentation) {
  if (!presentation.slides.length) {
    throw badRequest('There are no slides to export yet. Add some Markdown content first.', 'NO_SLIDES');
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Slide HTML is sanitized already; disabling JavaScript is a second line of defense.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (isAllowedResource(request.url())) request.continue();
      else request.abort('blockedbyclient');
    });

    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(buildPresentationHtml(presentation), { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({
      width: '1280px',
      height: '720px',
      printBackground: true,
      preferCSSPageSize: true,
      timeout: RENDER_TIMEOUT_MS,
    });
    return Buffer.from(pdf);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err?.name === 'TimeoutError') {
      throw new AppError(504, 'EXPORT_TIMEOUT', 'The PDF took too long to create. Large images can slow this down; please try again.');
    }
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Turn a user-provided name into a safe file name with the given extension. */
export function exportFilename(name, extension) {
  const base = String(name ?? '')
    .replace(/\.(pdf|html?|json|md|markdown)$/i, '')
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'presentation'}.${extension}`;
}
