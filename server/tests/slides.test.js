import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { arrangeSlide, buildPresentationHtml, detectLayout, generatePresentation, resolveTheme, resolveTransition } from '../services/slideGenerator.js';
import { parseMarkdown } from '../utils/markdownParser.js';

describe('slideGenerator', () => {
  it('detects title, quote and content layouts', () => {
    assert.equal(detectLayout('<h1>Hi</h1><p>Sub</p>'), 'title');
    assert.equal(detectLayout('<blockquote><p>Q</p></blockquote><p>— A</p>'), 'quote');
    assert.equal(detectLayout('<h2>Agenda</h2><ul><li>a</li></ul>'), 'content');
    assert.equal(detectLayout('<h1>Hi</h1><ul><li>a</li></ul>'), 'content');
  });

  it('resolves themes: request > front matter > default', () => {
    assert.equal(resolveTheme('midnight', 'sunset'), 'midnight');
    assert.equal(resolveTheme(undefined, 'sunset'), 'sunset');
    assert.equal(resolveTheme(undefined, 'nope'), 'default');
    assert.throws(() => resolveTheme('nope'), { code: 'INVALID_THEME' });
  });

  it('resolves transitions: request > front matter > default', () => {
    assert.equal(resolveTransition('fade', 'zoom'), 'fade');
    assert.equal(resolveTransition(undefined, 'Zoom'), 'zoom');
    assert.equal(resolveTransition(undefined, 'spin'), 'slide');
    assert.throws(() => resolveTransition('spin'), { code: 'INVALID_TRANSITION' });
    assert.equal(generatePresentation('---\ntransition: fade\n---\n# Hi').transition, 'fade');
  });

  const arrange = (markdown) => arrangeSlide(parseMarkdown(markdown).slides[0].html);
  const IMG = '![A chart](https://example.com/chart.png)';

  it('gives image-only slides the image layout with a captioned figure', () => {
    const { layout, html } = arrange(`## Results\n\n${IMG}`);
    assert.equal(layout, 'image');
    assert.match(html, /<h2>Results<\/h2>\s*<figure class="sc-figure"><img [^>]*><figcaption>A chart<\/figcaption><\/figure>/);
  });

  it('turns several images into a gallery', () => {
    const { layout, html } = arrange(`## Photos\n\n${IMG} ${IMG}\n\n${IMG}`);
    assert.equal(layout, 'image');
    assert.match(html, /<div class="sc-gallery sc-gallery--3">/);
    assert.equal(html.match(/<figure/g).length, 3);
  });

  it('puts one image beside text in the media layout', () => {
    const { layout, html } = arrange(`## Why\n\n- Fast\n- Simple\n\n${IMG}`);
    assert.equal(layout, 'media');
    assert.match(html, /^<h2>Why<\/h2><div class="sc-media"><div class="sc-media-text"><ul>[\s\S]*<\/ul><\/div><figure class="sc-figure">/);
  });

  it('right-aligns number columns and marks wide tables', () => {
    const { html } = arrange('| Region | Sales | Growth |\n|---|---|---|\n| North | $1,200 | 12.5% |\n| South | 950 | -3% |');
    assert.match(html, /<th>Region<\/th>/);
    assert.match(html, /<th class="sc-num">Sales<\/th>/);
    assert.equal(html.match(/<td class="sc-num">/g).length, 4);
    const wide = arrange('| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | x |').html;
    assert.match(wide, /<table class="sc-table--wide">/);
  });

  it('builds a standalone HTML document with escaped title', () => {
    const presentation = generatePresentation('---\ntitle: <b>Talk</b>\n---\n# One\n---\n## Two');
    const html = buildPresentationHtml(presentation);
    assert.match(html, /<title>&lt;b&gt;Talk&lt;\/b&gt;<\/title>/);
    assert.equal(html.match(/class="sc-slide /g).length, 2);
    assert.match(html, /class="sc-theme-default"/);
    assert.match(html, /--sc-accent/);
  });
});

describe('slides API', () => {
  let server;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  const post = (path, body) =>
    fetch(`${server.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const upload = (name, content, type = 'text/markdown') => {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), name);
    return fetch(`${server.baseUrl}/api/slides/upload`, { method: 'POST', body: form });
  };

  it('parses markdown into slides', async () => {
    const res = await post('/api/slides/parse', { markdown: '# Hello\n---\n## World', theme: 'midnight' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.slides.length, 2);
    assert.equal(body.theme, 'midnight');
    assert.equal(body.slides[0].layout, 'title');
  });

  it('accepts empty markdown for the live preview', async () => {
    const res = await post('/api/slides/parse', { markdown: '' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).slides.length, 0);
  });

  it('rejects an unknown theme', async () => {
    const res = await post('/api/slides/parse', { markdown: '# Hi', theme: 'nope' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_THEME');
  });

  it('accepts .md uploads', async () => {
    const res = await upload('../../etc/My Deck!.md', '# Uploaded\n---\n## Two');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.filename, 'My Deck.md');
    assert.equal(body.presentation.slides.length, 2);
  });

  it('rejects other file types', async () => {
    const res = await upload('notes.txt', 'hello', 'text/plain');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_FILE_TYPE');
  });

  it('rejects files over 10 MB', async () => {
    const res = await upload('big.md', 'a'.repeat(10 * 1024 * 1024 + 1));
    assert.equal(res.status, 413);
    assert.match((await res.json()).error.message, /10 MB/);
  });

  it('rejects empty and binary uploads', async () => {
    assert.equal((await (await upload('empty.md', '   ')).json()).error.code, 'EMPTY_FILE');
    assert.equal((await (await upload('bin.md', new Uint8Array([0, 1, 2]))).json()).error.code, 'INVALID_FILE');
  });

  it('requires a file', async () => {
    const res = await fetch(`${server.baseUrl}/api/slides/upload`, { method: 'POST', body: new FormData() });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'MISSING_FILE');
  });

  it('serves the sample deck and theme list', async () => {
    const sample = await (await fetch(`${server.baseUrl}/api/slides/sample`)).json();
    assert.match(sample.markdown, /Slidecraft/);
    const { themes, defaultTheme } = await (await fetch(`${server.baseUrl}/api/themes`)).json();
    assert.ok(themes.length >= 5);
    assert.equal(defaultTheme, 'default');
    const css = await fetch(`${server.baseUrl}/api/themes/styles.css`);
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.match(await css.text(), /\.sc-theme-midnight/);
  });
});
