import { Marked } from 'marked';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { fitSlide, splitSections } from './slideFitter.js';

const marked = new Marked({ gfm: true, breaks: false });

const DOMPurify = createDOMPurify(new JSDOM('').window);

// Open links in a new tab without giving the target page access to ours.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  // Slides are static content: no forms, embeds or styles that would fight the theme.
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame', 'object', 'embed', 'link', 'meta', 'base'],
  FORBID_ATTR: ['style'],
  ADD_ATTR: ['target'],
};

/** Sanitize an HTML string so it is safe to inject into the page or the PDF renderer. */
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, SANITIZE_OPTIONS);
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const SLIDE_SEPARATOR = /^\s{0,3}---\s*$/;
const NOTES_MARKER = /^\s{0,3}notes?:\s?/i;
const FRONT_MATTER_LINE = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;

/**
 * Split text into lines while tracking whether each line is inside a fenced code block,
 * so separators and note markers inside code are ignored.
 */
function annotateLines(text) {
  let fence = null;
  return text.split('\n').map((line) => {
    const match = line.match(FENCE);
    if (match) {
      const marker = match[1];
      if (!fence) {
        fence = marker;
        return { line, inCode: true };
      }
      if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
        return { line, inCode: true };
      }
    }
    return { line, inCode: fence !== null };
  });
}

/** Read `key: value` front matter from the top of the document, if present. */
export function extractFrontMatter(text) {
  const lines = text.split('\n');
  if (!SLIDE_SEPARATOR.test(lines[0] ?? '')) return { meta: {}, body: text };

  const end = lines.findIndex((line, i) => i > 0 && SLIDE_SEPARATOR.test(line));
  if (end === -1) return { meta: {}, body: text };

  const candidate = lines.slice(1, end).filter((line) => line.trim() !== '');
  if (candidate.length === 0 || !candidate.every((line) => FRONT_MATTER_LINE.test(line))) {
    return { meta: {}, body: text };
  }

  const meta = {};
  for (const line of candidate) {
    const [, key, raw] = line.match(FRONT_MATTER_LINE);
    meta[key.toLowerCase()] = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { meta, body: lines.slice(end + 1).join('\n') };
}

/**
 * Split a Markdown body into raw slide sources on `---` lines outside code blocks.
 * A document without any `---` lines (such as an uploaded article or README) is split
 * into one slide per `#`/`##` section instead.
 */
export function splitSlides(body) {
  const lines = annotateLines(body);
  if (!lines.some(({ line, inCode }) => !inCode && SLIDE_SEPARATOR.test(line))) return splitSections(lines);

  const slides = [[]];
  for (const { line, inCode } of lines) {
    if (!inCode && SLIDE_SEPARATOR.test(line)) {
      slides.push([]);
    } else {
      slides.at(-1).push(line);
    }
  }
  return slides.map((lines) => lines.join('\n').trim()).filter((source) => source !== '');
}

/** Separate speaker notes (everything after a `Note:` line) from slide content. */
export function extractNotes(source) {
  const annotated = annotateLines(source);
  const index = annotated.findIndex(({ line, inCode }) => !inCode && NOTES_MARKER.test(line));
  if (index === -1) return { content: source, notes: '' };

  const lines = annotated.map(({ line }) => line);
  const notes = [lines[index].replace(NOTES_MARKER, ''), ...lines.slice(index + 1)].join('\n').trim();
  return { content: lines.slice(0, index).join('\n').trim(), notes };
}

function plainText(html) {
  return JSDOM.fragment(html).textContent.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a Markdown document into deck metadata and slides.
 * @param {string} markdown
 * `source` is the index of the slide in the Markdown that each slide came from (several slides
 * share one when a long slide is split), so edits can target the slide as written.
 * @returns {{ meta: Record<string,string>, slides: Array<{ id: string, index: number, source: number, markdown: string, html: string, notes: string, title: string }> }}
 */
export function parseMarkdown(markdown) {
  const { meta, body } = extractFrontMatter(markdown);

  // Slides with more content than fits are split into continuation slides; notes stay on the first one.
  const pieces = splitSlides(body).flatMap((text, source) => {
    const { content, notes } = extractNotes(text);
    return fitSlide(content).map((piece, i) => ({ content: piece, notes: i === 0 ? notes : '', source }));
  });

  const slides = pieces.map(({ content, notes, source }, index) => {
    const html = sanitizeHtml(marked.parse(content));
    const heading = JSDOM.fragment(html).querySelector('h1, h2, h3, h4, h5, h6');
    return {
      id: `slide-${index + 1}`,
      index,
      source,
      markdown: content,
      html,
      notes,
      title: heading ? plainText(heading.innerHTML) : '',
    };
  });

  return { meta, slides };
}
