import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractFrontMatter, extractNotes, parseMarkdown, splitSlides } from '../utils/markdownParser.js';
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
