import { JSDOM } from 'jsdom';
import { parseMarkdown } from '../utils/markdownParser.js';
import { badRequest } from '../utils/errors.js';
import { DEFAULT_THEME, getThemeCss, isValidTheme } from '../themes/index.js';

/**
 * Pick a layout from the slide's content.
 * - title: just a big heading and short text (e.g. the opening or closing slide)
 * - quote: built around a blockquote
 * - content: everything else
 */
export function detectLayout(html) {
  const elements = [...JSDOM.fragment(html).children];
  const tags = elements.map((el) => el.tagName.toLowerCase());

  if (tags.length > 0 && tags.includes('blockquote') && tags.every((t) => t === 'blockquote' || t === 'p')) {
    return 'quote';
  }
  if (tags[0] === 'h1' && tags.slice(1).every((t) => t === 'p') && tags.length <= 3) {
    return 'title';
  }
  return 'content';
}

/**
 * Resolve the theme: an explicit request wins, then the deck's front matter, then the default.
 * An unknown theme in the request is a client error; an unknown one in front matter is ignored.
 */
export function resolveTheme(requested, frontMatterTheme) {
  if (requested !== undefined && requested !== null && requested !== '') {
    if (!isValidTheme(requested)) throw badRequest('That theme does not exist. Please pick one from the list.', 'INVALID_THEME');
    return requested;
  }
  return isValidTheme(frontMatterTheme) ? frontMatterTheme : DEFAULT_THEME;
}

/**
 * Turn Markdown into a presentation: metadata, theme and slides with layouts.
 * @param {string} markdown already validated input
 * @param {{ theme?: string }} [options]
 */
export function generatePresentation(markdown, { theme } = {}) {
  const { meta, slides } = parseMarkdown(markdown);
  return {
    title: meta.title || slides[0]?.title || 'Untitled presentation',
    meta,
    theme: resolveTheme(theme, meta.theme),
    slides: slides.map((slide) => ({ ...slide, layout: detectLayout(slide.html) })),
  };
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Build a standalone HTML document for a presentation, used for PDF export.
 * Slide HTML is already sanitized by the parser.
 */
export function buildPresentationHtml(presentation) {
  const sections = presentation.slides
    .map(
      (slide, i) => `<section class="sc-slide sc-slide--${slide.layout}">
  <div class="sc-slide-content">${slide.html}</div>
  <div class="sc-slide-number">${i + 1}</div>
</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(presentation.title)}</title>
<style>
@page { size: 1280px 720px; margin: 0; }
html, body { margin: 0; padding: 0; }
.sc-slide { break-after: page; page-break-after: always; }
.sc-slide:last-child { break-after: auto; page-break-after: auto; }
${getThemeCss(presentation.theme)}
</style>
</head>
<body class="sc-theme-${presentation.theme}">
${sections}
</body>
</html>`;
}
