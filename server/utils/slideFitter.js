import { Lexer } from 'marked';

/*
 * Keeps slide content inside the 1280x720 slide by splitting slides that are too tall.
 *
 * Heights are estimated from the sizes in themes/base.css (fonts, line heights, margins),
 * using a slightly wide average character width so estimates err on the side of
 * splitting a little early rather than letting text run off the slide.
 * If you change sizes in base.css, update the numbers below to match.
 */

// Content box: 1280x720 minus 88px/64px padding, minus the corporate theme's 16px top band
// and a small safety margin.
const CONTENT_WIDTH = 1104;
const CONTENT_HEIGHT = 568;
const BLOCK_GAP = 20;
const CHAR_WIDTH_EM = 0.5;
const HEADING_CHAR_WIDTH_EM = 0.58; // headings are bold

const BODY = { size: 24, lineHeight: 1.5 };
const HEADINGS = {
  1: { size: 72, lineHeight: 1.15 }, // title slides use 72px; content slides 56px
  2: { size: 40, lineHeight: 1.15, extra: 21 }, // accent bar below the heading
  3: { size: 30, lineHeight: 1.15 },
  4: { size: 26, lineHeight: 1.15 },
};
const LIST_INDENT = 31;
const LIST_ITEM_GAP = 8;
const CODE = { size: 18, lineHeight: 1.5, padding: 44, inset: 52, charEm: 0.64 };
const QUOTE = { size: 34, lineHeight: 1.3, padding: 12, indent: 34 };
const TABLE = { size: 20, wideSize: 17, lineHeight: 1.4, cellPadding: 21, cellInset: 32, wideCellInset: 24 };
const INLINE_IMAGE_HEIGHT = 320;
// Media slides put text in a column beside the image (grid 1.15fr / 1fr with a 48px gap).
const MEDIA_TEXT_WIDTH = Math.floor(((CONTENT_WIDTH - 48) * 1.15) / 2.15);
const SHORT_CAPTION = 160;

const LEXER_OPTIONS = { gfm: true, breaks: false };
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const IMAGE_PARAGRAPH = /^(\s*(\[\s*)?!\[[^\]]*\]\([^)]*\)(\s*\]\([^)]*\))?\s*)+$/;

/** Approximate the visible text of inline Markdown (links show their label, images nothing). */
function visibleText(markdown) {
  return markdown
    .replace(IMAGE, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrappedLines(text, width, fontSize, charEm = CHAR_WIDTH_EM) {
  const perLine = Math.max(1, Math.floor(width / (fontSize * charEm)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

const countImages = (markdown) => (markdown.match(IMAGE) ?? []).length;

function textHeight(markdown, { width = CONTENT_WIDTH, size = BODY.size, lineHeight = BODY.lineHeight } = {}) {
  const text = visibleText(markdown);
  const images = countImages(markdown) * INLINE_IMAGE_HEIGHT;
  if (!text) return images;
  return images + wrappedLines(text, width, size) * size * lineHeight;
}

function headingHeight(text, depth, width = CONTENT_WIDTH) {
  const style = HEADINGS[Math.min(depth, 4)];
  return wrappedLines(visibleText(text), width, style.size, HEADING_CHAR_WIDTH_EM) * style.size * style.lineHeight + (style.extra ?? 0);
}

/** Height of one list item, including nested items (shown at 0.9em). */
function listItemHeight(item, width) {
  let height = LIST_ITEM_GAP;
  const lines = item.text.split('\n').filter((line) => line.trim() !== '');
  lines.forEach((line, i) => {
    const nested = i > 0 && /^\s*([-*+]|\d+[.)])\s/.test(line);
    const size = nested ? BODY.size * 0.9 : BODY.size;
    height += (nested ? LIST_ITEM_GAP : 0) + textHeight(line.replace(/^\s*([-*+]|\d+[.)])\s+/, ''), { width: width - (nested ? LIST_INDENT : 0), size });
  });
  return height + (item.loose ? BLOCK_GAP : 0);
}

function tableRowHeight(cells, columns, width) {
  const wide = columns >= 5;
  const size = wide ? TABLE.wideSize : TABLE.size;
  const cellWidth = width / columns - (wide ? TABLE.wideCellInset : TABLE.cellInset);
  const lines = Math.max(1, ...cells.map((cell) => wrappedLines(visibleText(cell), cellWidth, size)));
  return lines * size * TABLE.lineHeight + TABLE.cellPadding;
}

/** Split prose at sentence ends; very long run-on sentences are split every 40 words. */
function sentences(text) {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .split(/(?<=[.!?])\s+(?=\S)/)
    .flatMap((sentence) => {
      if (sentence.length <= 300) return [sentence];
      const words = sentence.split(' ');
      return Array.from({ length: Math.ceil(words.length / 40) }, (_, i) => words.slice(i * 40, i * 40 + 40).join(' '));
    })
    .map((md) => ({ md, height: 0 }));
}

/**
 * A block is one top-level piece of slide content. Splittable blocks (lists, tables, code,
 * long paragraphs and quotes) have `parts` and `build(parts)`, so they can be divided across slides.
 * Paragraphs that contain only images become `image` blocks; image and media layouts size those.
 */
function toBlock(token, width = CONTENT_WIDTH) {
  const raw = token.raw.replace(/\n+$/, '');
  switch (token.type) {
    case 'heading':
      return { kind: 'heading', depth: token.depth, text: token.text, md: raw, height: headingHeight(token.text, token.depth, width) };

    case 'list': {
      const start = token.ordered ? Number(token.start) || 1 : null;
      const items = token.items.map((item) => item.raw.replace(/\n+$/, ''));
      const heights = token.items.map((item) => listItemHeight({ ...item, loose: token.loose }, width - LIST_INDENT));
      const separator = token.loose ? '\n\n' : '\n';
      return splittable({
        kind: 'list',
        parts: items.map((md, i) => ({ md, height: heights[i] })),
        overhead: LIST_ITEM_GAP,
        // Renumber ordered items so a list split across slides keeps counting.
        build: (parts, offset) =>
          parts
            .map((part, i) => (start === null ? part.md : part.md.replace(/^(\s*)\d+([.)])/, `$1${start + offset + i}$2`)))
            .join(separator),
      });
    }

    case 'table': {
      const lines = raw.split('\n');
      const head = lines.slice(0, 2).join('\n');
      const columns = Math.max(1, token.header.length);
      return splittable({
        kind: 'table',
        parts: lines.slice(2).map((md, i) => ({ md, height: tableRowHeight(token.rows[i]?.map((c) => c.text) ?? [md], columns, width) })),
        overhead: tableRowHeight(token.header.map((c) => c.text), columns, width) + 2,
        // Every piece of a split table repeats the header row.
        build: (parts) => [head, ...parts.map((part) => part.md)].join('\n'),
      });
    }

    case 'code': {
      const fence = token.codeBlockStyle === 'indented' ? '```' : raw.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? '```';
      const lineHeight = CODE.size * CODE.lineHeight;
      return splittable({
        kind: 'code',
        parts: token.text.split('\n').map((md) => ({ md, height: wrappedLines(md, width - CODE.inset, CODE.size, CODE.charEm) * lineHeight })),
        overhead: CODE.padding,
        build: (parts) => `${fence}${token.lang ?? ''}\n${parts.map((part) => part.md).join('\n')}\n${fence}`,
      });
    }

    case 'paragraph':
      if (IMAGE_PARAGRAPH.test(raw)) return { kind: 'image', images: countImages(raw), md: raw, height: INLINE_IMAGE_HEIGHT };
      return splittable({
        kind: 'paragraph',
        parts: sentences(raw),
        overhead: 0,
        build: (parts) => parts.map((part) => part.md).join(' '),
        // Sentences flow together, so measure the joined text rather than summing parts.
        measure: (parts) => textHeight(parts.map((part) => part.md).join(' '), { width }),
      });

    case 'blockquote':
      return splittable({
        kind: 'blockquote',
        parts: sentences(token.text),
        overhead: QUOTE.padding,
        build: (parts) => `> ${parts.map((part) => part.md).join(' ')}`,
        measure: (parts) => QUOTE.padding + textHeight(parts.map((part) => part.md).join(' '), { ...QUOTE, width: width - QUOTE.indent }),
      });

    case 'hr':
    case 'space':
    case 'def':
      return null;

    default:
      return { kind: token.type, md: raw, height: textHeight(raw, { width }) };
  }
}

function splittable(config) {
  const measure = config.measure ?? ((parts) => config.overhead + parts.reduce((sum, part) => sum + part.height, 0));
  const piece = (parts, offset = 0) => ({ ...config, parts, offset, md: config.build(parts, offset), height: measure(parts), measure, piece });
  return piece(config.parts);
}

/** Take as many leading parts of a splittable block as fit in `space` (at least `min`). */
function takeParts(block, space, min) {
  let count = 0;
  while (count < block.parts.length && block.measure(block.parts.slice(0, count + 1)) <= space) count += 1;
  count = Math.min(Math.max(count, min), block.parts.length - 1);
  if (count === 0) return null;
  return [block.piece(block.parts.slice(0, count), block.offset), block.piece(block.parts.slice(count), block.offset + count)];
}

const stackHeight = (blocks) => blocks.reduce((sum, block, i) => sum + block.height + (i > 0 ? BLOCK_GAP : 0), 0);

/**
 * Same rule as arrangeSlide's image layout: images plus headings and at most one short paragraph.
 * The images are scaled to fill the slide, so these slides always fit.
 */
function isImageSlide(blocks) {
  if (!blocks.some((block) => block.kind === 'image')) return false;
  const text = blocks.filter((block) => block.kind !== 'image' && block.kind !== 'heading');
  return text.length <= 1 && text.every((block) => block.kind === 'paragraph' && visibleText(block.md).length <= SHORT_CAPTION);
}

/** A media slide (one image beside text) fits when its text fits in the text column. */
function fitsAsMedia(tokens, blocks) {
  const images = blocks.filter((block) => block.kind === 'image');
  if (images.length !== 1 || images[0].images !== 1) return false;
  const leading = [];
  for (const block of blocks) {
    if (block.kind !== 'heading') break;
    leading.push(block);
  }
  const textBlocks = tokens
    .slice(leading.length)
    .map((token) => toBlock(token, MEDIA_TEXT_WIDTH))
    .filter((block) => block && block.kind !== 'image');
  return stackHeight(leading) + (leading.length ? BLOCK_GAP : 0) + stackHeight(textBlocks) <= CONTENT_HEIGHT;
}

/**
 * Split one slide's Markdown into one or more pieces that each fit on a slide.
 * Continuation slides repeat the slide's heading with "(continued)". Images that cannot
 * share a slide with the text get a slide of their own.
 * @param {string} markdown slide content without speaker notes
 * @returns {string[]}
 */
export function fitSlide(markdown) {
  const tokens = Lexer.lex(markdown, LEXER_OPTIONS).filter((token) => !['hr', 'space', 'def'].includes(token.type));
  const blocks = tokens.map((token) => toBlock(token)).filter(Boolean);
  if (isImageSlide(blocks) || fitsAsMedia(tokens, blocks)) return [markdown];
  if (!blocks.some((block) => block.kind === 'image') && stackHeight(blocks) <= CONTENT_HEIGHT) return [markdown];

  const titleBlock = blocks[0]?.kind === 'heading' ? blocks[0] : null;
  const continuation = () => {
    const text = `${titleBlock.text.replace(/\s*\(continued\)$/i, '')} (continued)`;
    const depth = Math.max(titleBlock.depth, 2);
    return { kind: 'heading', continuation: true, depth, text, md: `${'#'.repeat(depth)} ${text}`, height: headingHeight(text, depth) };
  };

  const slides = [];
  let current = [];
  let used = 0;

  const add = (block) => {
    used += block.height + (current.length ? BLOCK_GAP : 0);
    current.push(block);
  };

  const onlyHeadings = () => current.every((block) => block.kind === 'heading');

  const flush = () => {
    // Never end a slide on a heading: carry trailing headings over to the next slide.
    const carried = [];
    while (current.length > 1 && current.at(-1).kind === 'heading') carried.unshift(current.pop());
    slides.push(current.map((block) => block.md).join('\n\n'));
    current = [];
    used = 0;
    if (carried.length) carried.forEach(add);
    else if (titleBlock) add(continuation());
  };

  const queue = [...blocks];
  while (queue.length) {
    const block = queue.shift();

    if (block.kind === 'image') {
      // Images get their own slide (with the heading) so they can be shown large.
      if (!onlyHeadings()) flush();
      add(block);
      flush();
      continue;
    }

    const gap = current.length ? BLOCK_GAP : 0;
    if (used + gap + block.height <= CONTENT_HEIGHT) {
      add(block);
      continue;
    }

    const freshSlide = onlyHeadings();
    if (block.parts?.length > 1) {
      // Fill the rest of this slide if a useful amount fits; a fresh slide always takes at least one part.
      const split = takeParts(block, CONTENT_HEIGHT - used - gap, freshSlide ? 1 : 0);
      if (split && (freshSlide || split[0].parts.length >= 2 || split[0].height >= CONTENT_HEIGHT / 4)) {
        add(split[0]);
        flush();
        queue.unshift(split[1]);
        continue;
      }
    }

    if (freshSlide) {
      // Too big even for an empty slide and cannot be split: give it its own slide.
      add(block);
    } else {
      flush();
      queue.unshift(block);
    }
  }
  // Skip a trailing slide that would only hold a "(continued)" heading.
  if (current.length && !(current.length === 1 && current[0].continuation)) slides.push(current.map((block) => block.md).join('\n\n'));
  return slides;
}

/**
 * Split a document that has no `---` separators into one slide per `#` or `##` section.
 * A heading that directly follows another heading (like a title and subtitle) stays with it.
 * @param {Array<{ line: string, inCode: boolean }>} lines annotated lines
 * @returns {string[]}
 */
export function splitSections(lines) {
  const sections = [[]];
  let hasContent = false;
  for (const { line, inCode } of lines) {
    const isSectionHeading = !inCode && /^\s{0,3}#{1,2}\s/.test(line);
    if (isSectionHeading && hasContent) {
      sections.push([]);
      hasContent = false;
    }
    sections.at(-1).push(line);
    if (!isSectionHeading && line.trim() !== '') hasContent = true;
  }
  return sections.map((section) => section.join('\n').trim()).filter((source) => source !== '');
}
