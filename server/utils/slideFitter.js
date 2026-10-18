import { Lexer } from 'marked';

/*
 * Keeps slide content inside the 1280x720 slide by splitting slides that are too tall.
 *
 * Heights are estimated from the sizes in themes/base.css (fonts, line heights, margins),
 * using a slightly wide average character width so estimates err on the side of
 * splitting a little early rather than letting text run off the slide.
 * If you change sizes in base.css, update the numbers below to match.
 */

// Content box: 1280x720 minus 96px/72px padding, minus the corporate theme's 16px top band
// and a small safety margin.
const CONTENT_WIDTH = 1088;
const CONTENT_HEIGHT = 548;
const BLOCK_GAP = 24;
const CHAR_WIDTH_EM = 0.5;
const HEADING_CHAR_WIDTH_EM = 0.58; // headings are bold

const BODY = { size: 30, lineHeight: 1.45 };
const HEADINGS = {
  1: { size: 88, lineHeight: 1.12 }, // title slides use 88px; content slides 72px
  2: { size: 52, lineHeight: 1.12, extra: 26 }, // accent bar below the heading
  3: { size: 38, lineHeight: 1.12 },
  4: { size: 32, lineHeight: 1.12 },
};
const LIST_INDENT = 39;
const LIST_ITEM_GAP = 10;
const CODE = { size: 24, lineHeight: 1.5, padding: 56, charEm: 0.64 };
const QUOTE = { size: 44, lineHeight: 1.3, padding: 16, indent: 44 };
const TABLE = { size: 26, lineHeight: 1.45, cellPadding: 28, cellInset: 40 };
const IMAGE_HEIGHT = 460;

const LEXER_OPTIONS = { gfm: true, breaks: false };

/** Approximate the visible text of inline Markdown (links show their label, images nothing). */
function visibleText(markdown) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
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

const countImages = (markdown) => (markdown.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;

function textHeight(markdown, { width = CONTENT_WIDTH, size = BODY.size, lineHeight = BODY.lineHeight } = {}) {
  const text = visibleText(markdown);
  const images = countImages(markdown) * IMAGE_HEIGHT;
  if (!text) return images;
  return images + wrappedLines(text, width, size) * size * lineHeight;
}

function headingHeight(text, depth) {
  const style = HEADINGS[Math.min(depth, 4)];
  return wrappedLines(visibleText(text), CONTENT_WIDTH, style.size, HEADING_CHAR_WIDTH_EM) * style.size * style.lineHeight + (style.extra ?? 0);
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

function tableRowHeight(cells, columns) {
  const width = CONTENT_WIDTH / columns - TABLE.cellInset;
  const lines = Math.max(1, ...cells.map((cell) => wrappedLines(visibleText(cell), width, TABLE.size)));
  return lines * TABLE.size * TABLE.lineHeight + TABLE.cellPadding + 2;
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
 * long paragraphs) have `parts` and `build(parts)`, so they can be divided across slides.
 */
function toBlock(token) {
  const raw = token.raw.replace(/\n+$/, '');
  switch (token.type) {
    case 'heading':
      return { kind: 'heading', depth: token.depth, text: token.text, md: raw, height: headingHeight(token.text, token.depth) };

    case 'list': {
      const start = token.ordered ? Number(token.start) || 1 : null;
      const items = token.items.map((item) => item.raw.replace(/\n+$/, ''));
      const heights = token.items.map((item) => listItemHeight({ ...item, loose: token.loose }, CONTENT_WIDTH - LIST_INDENT));
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
        parts: lines.slice(2).map((md, i) => ({ md, height: tableRowHeight(token.rows[i]?.map((c) => c.text) ?? [md], columns) })),
        overhead: tableRowHeight(token.header.map((c) => c.text), columns),
        // Every piece of a split table repeats the header row.
        build: (parts) => [head, ...parts.map((part) => part.md)].join('\n'),
      });
    }

    case 'code': {
      const fence = token.codeBlockStyle === 'indented' ? '```' : raw.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? '```';
      const lineHeight = CODE.size * CODE.lineHeight;
      return splittable({
        kind: 'code',
        parts: token.text.split('\n').map((md) => ({ md, height: wrappedLines(md, CONTENT_WIDTH - 64, CODE.size, CODE.charEm) * lineHeight })),
        overhead: CODE.padding,
        build: (parts) => `${fence}${token.lang ?? ''}\n${parts.map((part) => part.md).join('\n')}\n${fence}`,
      });
    }

    case 'paragraph':
      return splittable({
        kind: 'paragraph',
        parts: sentences(raw),
        overhead: 0,
        build: (parts) => parts.map((part) => part.md).join(' '),
        // Sentences flow together, so measure the joined text rather than summing parts.
        measure: (parts) => textHeight(parts.map((part) => part.md).join(' ')),
      });

    case 'blockquote':
      return splittable({
        kind: 'blockquote',
        parts: sentences(token.text),
        overhead: QUOTE.padding,
        build: (parts) => `> ${parts.map((part) => part.md).join(' ')}`,
        measure: (parts) => QUOTE.padding + textHeight(parts.map((part) => part.md).join(' '), { width: CONTENT_WIDTH - QUOTE.indent, ...QUOTE }),
      });

    case 'hr':
    case 'space':
    case 'def':
      return null;

    default:
      return { kind: token.type, md: raw, height: textHeight(raw) };
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

/**
 * Split one slide's Markdown into one or more pieces that each fit on a slide.
 * Continuation slides repeat the slide's heading with "(continued)".
 * @param {string} markdown slide content without speaker notes
 * @returns {string[]}
 */
export function fitSlide(markdown) {
  const blocks = Lexer.lex(markdown, LEXER_OPTIONS).map(toBlock).filter(Boolean);
  const total = blocks.reduce((sum, block, i) => sum + block.height + (i > 0 ? BLOCK_GAP : 0), 0);
  if (total <= CONTENT_HEIGHT) return [markdown];

  const titleBlock = blocks[0]?.kind === 'heading' ? blocks[0] : null;
  const continuation = () => {
    const text = `${titleBlock.text.replace(/\s*\(continued\)$/i, '')} (continued)`;
    return { kind: 'heading', depth: Math.max(titleBlock.depth, 2), text, md: `${'#'.repeat(Math.max(titleBlock.depth, 2))} ${text}`, height: headingHeight(text, 2) };
  };

  const slides = [];
  let current = [];
  let used = 0;

  const add = (block) => {
    used += block.height + (current.length ? BLOCK_GAP : 0);
    current.push(block);
  };

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
    const gap = current.length ? BLOCK_GAP : 0;
    if (used + gap + block.height <= CONTENT_HEIGHT) {
      add(block);
      continue;
    }

    const freshSlide = current.length === 0 || (current.length === 1 && current[0].kind === 'heading');
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
      // Too big even for an empty slide and cannot be split (e.g. a huge image): give it its own slide.
      add(block);
    } else {
      flush();
      queue.unshift(block);
    }
  }
  if (current.length && !(current.length === 1 && current[0].text?.endsWith('(continued)'))) {
    slides.push(current.map((block) => block.md).join('\n\n'));
  }
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
