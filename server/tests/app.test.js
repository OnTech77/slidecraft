import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { AppError, toSafeError } from '../utils/errors.js';

describe('app', () => {
  let server;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  it('responds to the health check', async () => {
    const res = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await fetch(`${server.baseUrl}/api/nope`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
  });

  it('rejects malformed JSON with a friendly message', async () => {
    const res = await fetch(`${server.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_JSON');
  });
});

describe('toSafeError', () => {
  it('passes AppError messages through', () => {
    const { status, body } = toSafeError(new AppError(422, 'X', 'Visible message'));
    assert.equal(status, 422);
    assert.deepEqual(body, { code: 'X', message: 'Visible message' });
  });

  it('hides internal error details', () => {
    const { status, body } = toSafeError(new Error('ECONNREFUSED 10.0.0.5:5432 secret'));
    assert.equal(status, 500);
    assert.doesNotMatch(body.message, /secret|ECONNREFUSED/);
  });
});
