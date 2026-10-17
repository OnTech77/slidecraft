import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { closeBrowser, isAllowedResource, pdfFilename } from '../services/exportService.js';

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
    assert.equal(pdfFilename('My Talk: 2026 / Q3'), 'My-Talk-2026-Q3.pdf');
    assert.equal(pdfFilename('deck.pdf'), 'deck.pdf');
    assert.equal(pdfFilename('"; rm -rf /'), 'rm-rf.pdf');
    assert.equal(pdfFilename(''), 'presentation.pdf');
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
});
