import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { closeBrowser, exportFilename, isAllowedResource } from '../services/exportService.js';
import { buildMarkdown } from '../services/formatExports.js';
import { generatePresentation } from '../services/slideGenerator.js';

describe('exportService helpers', () => {
  it('allows only data URLs and public HTTPS resources', () => {
    assert.ok(isAllowedResource('data:image/png;base64,AAAA'));
    assert.ok(isAllowedResource('https://images.example.com/cat.png'));
    assert.ok(!isAllowedResource('http://example.com/cat.png'));
    assert.ok(!isAllowedResource('file:///etc/passwd'));
    assert.ok(!isAllowedResource('https://localhost/secret'));
    assert.ok(!isAllowedResource('https://127.0.0.1/secret'));
    assert.ok(!isAllowedResource('https://192.168.1.10/router'));
    assert.ok(!isAllowedResource('https://172.20.0.1/'));
    assert.ok(!isAllowedResource('https://169.254.169.254/latest/meta-data'));
    assert.ok(!isAllowedResource('https://[::1]/'));
    assert.ok(!isAllowedResource('not a url'));
  });

  it('builds safe file names', () => {
    assert.equal(exportFilename('My Talk: 2026 / Q3', 'pdf'), 'My-Talk-2026-Q3.pdf');
    assert.equal(exportFilename('deck.pdf', 'pdf'), 'deck.pdf');
    assert.equal(exportFilename('deck.pdf', 'json'), 'deck.json');
    assert.equal(exportFilename('"; rm -rf /', 'html'), 'rm-rf.html');
    assert.equal(exportFilename('', 'md'), 'presentation.md');
  });

  it('exports Markdown that imports back as the same deck', () => {
    const long = `## Long list\n\n${Array.from({ length: 30 }, (_, i) => `- Point number ${i + 1} with some extra words`).join('\n')}`;
    const original = generatePresentation(`---\ntitle: Round trip\nauthor: Me\n---\n# Hello\n---\n${long}\n\nNote: say it`, { theme: 'sunset', transition: 'zoom' });
    const markdown = buildMarkdown(original);
    assert.match(markdown, /^---\ntitle: Round trip\nauthor: Me\ntheme: sunset\ntransition: zoom\n---/);
    const reimported = generatePresentation(markdown);
    assert.equal(reimported.theme, 'sunset');
    assert.equal(reimported.transition, 'zoom');
    assert.deepEqual(
      reimported.slides.map(({ markdown: md, notes, layout }) => ({ md, notes, layout })),
      original.slides.map(({ markdown: md, notes, layout }) => ({ md, notes, layout })),
    );
  });
});

describe('export API', () => {
  let server;
  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await closeBrowser();
    await server.close();
  });

  const exportDeck = (format, body) =>
    fetch(`${server.baseUrl}/api/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('rejects unsupported formats and empty decks', async () => {
    assert.equal((await (await exportDeck('pptx', { markdown: '# Hi' })).json()).error.code, 'UNSUPPORTED_FORMAT');
    assert.equal((await (await exportDeck('pdf', { markdown: '' })).json()).error.code, 'MISSING_CONTENT');
    assert.equal((await (await exportDeck('pdf', { markdown: '---\n---\n' })).json()).error.code, 'NO_SLIDES');
  });

  it('renders one PDF page per slide', { timeout: 60_000 }, async () => {
    const res = await exportDeck('pdf', {
      markdown: '# One\n---\n## Two\n- a\n- b\n---\n> Three',
      theme: 'midnight',
      filename: 'Test Deck',
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), /filename="Test-Deck\.pdf"/);
    const pdf = Buffer.from(await res.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? [];
    assert.equal(pages.length, 3);
  });

  it('exports HTML, Markdown and JSON with matching file names', async () => {
    const body = { markdown: '# One\n---\n## Two\n- a\n\nNote: hi <b>', theme: 'editorial', filename: 'My Deck' };

    const html = await exportDeck('html', body);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /^text\/html/);
    assert.match(html.headers.get('content-disposition'), /filename="My-Deck\.html"/);
    const page = await html.text();
    assert.match(page, /class="sc-theme-editorial"/);
    assert.equal(page.match(/<section class="sc-slide/g).length, 2);
    assert.match(page, /Notes:<\/strong> hi &lt;b&gt;/, 'notes are escaped');

    const md = await exportDeck('md', body);
    assert.match(md.headers.get('content-type'), /^text\/markdown/);
    assert.match(md.headers.get('content-disposition'), /filename="My-Deck\.md"/);
    assert.match(await md.text(), /# One\n\n---\n\n## Two\n- a\n\nNote: hi <b>/);

    const json = await exportDeck('json', body);
    assert.match(json.headers.get('content-disposition'), /filename="My-Deck\.json"/);
    const deck = await json.json();
    assert.equal(deck.slideCount, 2);
    assert.equal(deck.theme, 'editorial');
    assert.deepEqual(
      deck.slides.map((s) => [s.number, s.title, s.layout, s.notes]),
      [
        [1, 'One', 'title', ''],
        [2, 'Two', 'content', 'hi <b>'],
      ],
    );
  });
});
