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

/** Slide transitions used when presenting. */
export const TRANSITIONS = ['slide', 'fade', 'zoom', 'none'];
export const DEFAULT_TRANSITION = 'slide';

/** Same rules as resolveTheme, for the presentation transition. */
export function resolveTransition(requested, frontMatterTransition) {
  if (requested !== undefined && requested !== null && requested !== '') {
    if (!TRANSITIONS.includes(requested)) throw badRequest('That transition does not exist. Please pick one from the list.', 'INVALID_TRANSITION');
    return requested;
  }
  const fromDeck = String(frontMatterTransition ?? '').toLowerCase();
  return TRANSITIONS.includes(fromDeck) ? fromDeck : DEFAULT_TRANSITION;
}

/** A paragraph that holds only images (optionally linked), like `![alt](src)`. */
function isImageParagraph(el) {
  if (el.tagName !== 'P' || !el.querySelector('img')) return false;
  return [...el.childNodes].every(
    (node) =>
      (node.nodeType === 3 && node.textContent.trim() === '') ||
      node.nodeName === 'IMG' ||
      node.nodeName === 'BR' ||
      (node.nodeName === 'A' && node.children.length === 1 && node.firstElementChild.tagName === 'IMG' && node.textContent.trim() === ''),
  );
}

/** Wrap an image (or a linked image) in a figure, using its alt text as the caption. */
function toFigure(doc, imageOrLink) {
  const figure = doc.createElement('figure');
  figure.className = 'sc-figure';
  figure.append(imageOrLink);
  const img = imageOrLink.tagName === 'IMG' ? imageOrLink : imageOrLink.querySelector('img');
  const alt = img.getAttribute('alt')?.trim();
  if (alt) {
    const caption = doc.createElement('figcaption');
    caption.textContent = alt;
    figure.append(caption);
  }
  return figure;
}

const NUMBER_CELL = /^[-+−]?[$€£¥]?\s?\d[\d,.\s]*(%|[kKmMbB])?$/;

/** Right-align columns that only contain numbers, and use a smaller size for wide tables. */
function formatTables(root) {
  for (const table of root.querySelectorAll('table')) {
    const headerCells = table.querySelectorAll('thead th');
    if (headerCells.length >= 5) table.classList.add('sc-table--wide');
    const rows = [...table.querySelectorAll('tbody tr')];
    headerCells.forEach((th, column) => {
      if (th.hasAttribute('align')) return;
      const cells = rows.map((row) => row.children[column]).filter(Boolean);
      const values = cells.map((cell) => cell.textContent.trim()).filter((text) => text !== '');
      if (values.length && values.every((text) => NUMBER_CELL.test(text))) {
        th.classList.add('sc-num');
        cells.forEach((cell) => cell.classList.add('sc-num'));
      }
    });
  }
}

/**
 * Choose the slide's layout and rearrange its HTML for it.
 * - image: only headings, images and at most one short line of text; images fill the slide
 * - media: one image beside text
 * - title / quote / content: see detectLayout
 * utils/slideFitter.js uses the same rules (isImageSlide / isMediaSlide) when splitting.
 * @param {string} html sanitized slide HTML
 * @returns {{ layout: string, html: string }}
 */
export function arrangeSlide(html) {
  const doc = new JSDOM('').window.document;
  const root = doc.createElement('div');
  root.innerHTML = html;
  formatTables(root);

  const elements = [...root.children];
  const imageParagraphs = elements.filter(isImageParagraph);
  if (imageParagraphs.length === 0) return { layout: detectLayout(root.innerHTML), html: root.innerHTML };

  const images = imageParagraphs.flatMap((p) => [...p.children].filter((el) => el.tagName === 'IMG' || el.tagName === 'A'));
  const others = elements.filter((el) => !imageParagraphs.includes(el));
  const headings = others.filter((el) => /^H[1-6]$/.test(el.tagName));
  const text = others.filter((el) => !headings.includes(el));
  const shortText = text.length <= 1 && text.every((el) => el.tagName === 'P' && el.textContent.length <= 160);

  if (shortText || images.length > 1) {
    // Image layout: replace the first image paragraph with a figure (or gallery), drop the rest.
    const shown = images.slice(0, 6);
    let visual;
    if (shown.length === 1) {
      visual = toFigure(doc, shown[0]);
    } else {
      visual = doc.createElement('div');
      visual.className = `sc-gallery sc-gallery--${shown.length}`;
      visual.append(...shown.map((img) => toFigure(doc, img)));
    }
    imageParagraphs[0].replaceWith(visual);
    imageParagraphs.slice(1).forEach((p) => p.remove());
    return { layout: shortText ? 'image' : 'content', html: root.innerHTML };
  }

  // Media layout: leading headings on top, then the text beside the image.
  const media = doc.createElement('div');
  media.className = 'sc-media';
  const textColumn = doc.createElement('div');
  textColumn.className = 'sc-media-text';
  const leading = [];
  for (const el of elements) {
    if (/^H[1-6]$/.test(el.tagName) && textColumn.children.length === 0 && el === elements[leading.length]) leading.push(el);
    else if (el !== imageParagraphs[0]) textColumn.append(el);
  }
  media.append(textColumn, toFigure(doc, images[0]));
  root.replaceChildren(...leading, media);
  return { layout: 'media', html: root.innerHTML };
}

/**
 * Turn Markdown into a presentation: metadata, theme, transition and slides with layouts.
 * @param {string} markdown already validated input
 * @param {{ theme?: string, transition?: string }} [options]
 */
export function generatePresentation(markdown, { theme, transition } = {}) {
  const { meta, slides } = parseMarkdown(markdown);
  return {
    title: meta.title || slides[0]?.title || 'Untitled presentation',
    meta,
    theme: resolveTheme(theme, meta.theme),
    transition: resolveTransition(transition, meta.transition),
    slides: slides.map((slide) => ({ ...slide, ...arrangeSlide(slide.html) })),
  };
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Build a standalone HTML document for a presentation, used for the PDF and HTML exports.
 * Slide HTML is already sanitized by the parser.
 * @param {object} presentation
 * @param {{ extraCss?: string, script?: string, wrapSlide?: (slideHtml: string, slide: object) => string }} [options]
 */
export function buildPresentationHtml(presentation, { extraCss = '', script = '', wrapSlide = (slideHtml) => slideHtml } = {}) {
  const sections = presentation.slides
    .map((slide, i) =>
      wrapSlide(
        `<section class="sc-slide sc-slide--${slide.layout}">
  <div class="sc-slide-content">${slide.html}</div>
  <div class="sc-slide-number">${i + 1}</div>
</section>`,
        slide,
      ),
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(presentation.title)}</title>
<style>
@page { size: 1280px 720px; margin: 0; }
html, body { margin: 0; padding: 0; }
.sc-slide { break-after: page; page-break-after: always; }
.sc-slide:last-child, .sc-deck > :last-child .sc-slide { break-after: auto; page-break-after: auto; }
${getThemeCss(presentation.theme)}
${extraCss}
</style>
</head>
<body class="sc-theme-${presentation.theme}">
<main class="sc-deck">
${sections}
</main>${script ? `\n<script>${script}\n</script>` : ''}
</body>
</html>`;
}
