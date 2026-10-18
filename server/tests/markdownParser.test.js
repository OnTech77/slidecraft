import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractFrontMatter, extractNotes, parseMarkdown, splitSlides } from '../utils/markdownParser.js';
import { fitSlide } from '../utils/slideFitter.js';
import { decodeTextFile, sanitizeMarkdownInput, validateMarkdown } from '../utils/validation.js';

describe('extractFrontMatter', () => {
  it('reads key/value pairs and strips quotes', () => {
    const { meta, body } = extractFrontMatter('---\ntitle: "My Talk"\nTheme: dark\n---\n# Hi');
    assert.deepEqual(meta, { title: 'My Talk', theme: 'dark' });
    assert.equal(body, '# Hi');
  });

  it('treats a leading separator without key/value lines as a normal slide break', () => {
    const text = '---\n# Slide one\n---\n# Slide two';
    assert.deepEqual(extractFrontMatter(text), { meta: {}, body: text });
  });
});

describe('splitSlides', () => {
  it('splits on --- and drops empty slides', () => {
    assert.deepEqual(splitSlides('# A\n---\n\n---\n# B'), ['# A', '# B']);
  });

  it('ignores separators inside fenced code blocks', () => {
    const slides = splitSlides('# A\n```yaml\n---\nkey: value\n```\n---\n# B');
    assert.equal(slides.length, 2);
    assert.match(slides[0], /key: value/);
  });
});

describe('splitting long content', () => {
  const bullets = (n, from = 1) => Array.from({ length: n }, (_, i) => `- Bullet point number ${from + i} with a few more words`).join('\n');

  it('splits a document without --- separators into one slide per section', () => {
    const slides = splitSlides('# Report\n## Subtitle\nIntro text\n## Part one\nText\n```\n## not a heading\n```\n# Part two\nMore');
    assert.deepEqual(slides, ['# Report\n## Subtitle\nIntro text', '## Part one\nText\n```\n## not a heading\n```', '# Part two\nMore']);
  });

  it('leaves slides that fit untouched', () => {
    const slide = `## Short\n\n${bullets(5)}`;
    assert.deepEqual(fitSlide(slide), [slide]);
  });

  it('splits long lists onto continuation slides that repeat the heading', () => {
    const pieces = fitSlide(`## Agenda\n\n${bullets(30)}`);
    assert.ok(pieces.length >= 3);
    assert.match(pieces[0], /^## Agenda\n/);
    for (const piece of pieces.slice(1)) assert.match(piece, /^## Agenda \(continued\)\n/);
    const items = pieces.join('\n').match(/^- Bullet point number \d+/gm);
    assert.equal(items.length, 30, 'no bullet is lost or duplicated');
  });

  it('keeps numbering when an ordered list is split', () => {
    const list = Array.from({ length: 30 }, (_, i) => `1. Step with a reasonably long description number ${i + 1}`).join('\n');
    const pieces = fitSlide(`## Steps\n\n${list}`);
    assert.ok(pieces.length > 1);
    assert.match(pieces[1], /\n\n(\d+)\. Step/);
    const firstOfSecond = Number(pieces[1].match(/\n\n(\d+)\. Step/)[1]);
    assert.equal(firstOfSecond, pieces[0].match(/^\d+\. /gm).length + 1);
  });

  it('repeats the header row when a table is split', () => {
    const rows = Array.from({ length: 25 }, (_, i) => `| row ${i} | value ${i} |`).join('\n');
    const pieces = fitSlide(`| Name | Value |\n|---|---|\n${rows}`);
    assert.ok(pieces.length > 1);
    for (const piece of pieces) assert.match(piece, /\| Name \| Value \|\n\|---\|---\|/);
  });

  it('splits long code blocks and keeps the fence and language', () => {
    const code = Array.from({ length: 40 }, (_, i) => `console.log(${i});`).join('\n');
    const pieces = fitSlide(`\`\`\`js\n${code}\n\`\`\``);
    assert.ok(pieces.length > 1);
    for (const piece of pieces) assert.match(piece, /^```js\n[\s\S]*\n```$/);
  });

  it('never ends a slide on a heading', () => {
    const pieces = fitSlide(`## Intro\n\n${bullets(9)}\n\n### Next part\n\n${bullets(9, 10)}`);
    for (const piece of pieces) assert.doesNotMatch(piece, /#+ [^\n]+$/, piece);
  });

  it('keeps speaker notes on the first slide of a split', () => {
    const { slides } = parseMarkdown(`## Long\n\n${bullets(30)}\n\nNote: remember this`);
    assert.ok(slides.length > 1);
    assert.equal(slides[0].notes, 'remember this');
    assert.ok(slides.slice(1).every((s) => s.notes === ''));
    assert.deepEqual(slides.map((s) => s.id), slides.map((_, i) => `slide-${i + 1}`));
  });
});

describe('extractNotes', () => {
  it('moves text after a Note: line into notes', () => {
    assert.deepEqual(extractNotes('# A\n- point\n\nNote: say hello\nand wave'), {
      content: '# A\n- point',
      notes: 'say hello\nand wave',
    });
  });

  it('ignores Note: inside code', () => {
    assert.equal(extractNotes('```\nNote: not a note\n```').notes, '');
  });
});

describe('parseMarkdown', () => {
  it('produces slides with HTML, titles and notes', () => {
    const { meta, slides } = parseMarkdown('---\ntitle: Demo\n---\n# Hello *world*\n---\n## Agenda\n- One\nNotes: remember');
    assert.equal(meta.title, 'Demo');
    assert.equal(slides.length, 2);
    assert.equal(slides[0].title, 'Hello world');
    assert.match(slides[0].html, /<h1>Hello <em>world<\/em><\/h1>/);
    assert.equal(slides[1].notes, 'remember');
    assert.equal(slides[1].id, 'slide-2');
  });

  it('strips scripts, event handlers, styles and javascript: links', () => {
    const { slides } = parseMarkdown(
      '# Hi\n<script>alert(1)</script>\n<img src="x" onerror="alert(1)">\n<p style="color:red">x</p>\n\n[bad](javascript:alert(1))\n\n<iframe src="https://evil.test"></iframe>',
    );
    const { html } = slides[0];
    assert.match(html, /<a\b/, 'the markdown link should still be rendered');
    assert.doesNotMatch(html, /<script|onerror|style=|javascript:|<iframe/i);
  });

  it('opens links in a new tab safely', () => {
    const { slides } = parseMarkdown('[site](https://example.com)');
    assert.match(slides[0].html, /target="_blank"/);
    assert.match(slides[0].html, /rel="noopener noreferrer"/);
  });

  it('parses the sample deck', async () => {
    const sample = await readFile(new URL('../../sample.md', import.meta.url), 'utf8');
    const { meta, slides } = parseMarkdown(sample);
    assert.equal(meta.title, 'Slidecraft Demo');
    assert.ok(slides.length >= 5);
    assert.ok(slides.some((s) => s.html.includes('<table>')));
    assert.ok(slides.some((s) => s.notes.length > 0));
  });
});

describe('validation', () => {
  it('normalizes line endings and strips control characters', () => {
    assert.equal(sanitizeMarkdownInput('a\r\nb\u0000c\u0007'), 'a\nbc');
  });

  it('rejects missing, non-string and empty content', () => {
    assert.throws(() => validateMarkdown(undefined), { code: 'MISSING_CONTENT' });
    assert.throws(() => validateMarkdown(42), { code: 'INVALID_CONTENT' });
    assert.throws(() => validateMarkdown('   '), { code: 'MISSING_CONTENT' });
    assert.equal(validateMarkdown('', { required: false }), '');
  });

  it('rejects binary and non-UTF-8 files', () => {
    assert.throws(() => decodeTextFile(Buffer.from([0x23, 0x00, 0x41])), { code: 'INVALID_FILE' });
    assert.throws(() => decodeTextFile(Buffer.from([0xff, 0xfe, 0xfd])), { code: 'INVALID_ENCODING' });
    assert.equal(decodeTextFile(Buffer.from('﻿# Hi', 'utf8')), '# Hi');
  });
});
