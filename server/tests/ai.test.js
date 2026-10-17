import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { MAX_AI_CHARS, enhanceMarkdown, mapAIError, stripWrappingFence } from '../services/aiService.js';

/** A stand-in for the Anthropic client that records the request and returns a canned answer. */
function fakeClient(respond) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream: (request) => {
          calls.push(request);
          return { finalMessage: async () => respond(request) };
        },
      },
    },
  };
}

const answer = (text, stop_reason = 'end_turn') => () => ({ stop_reason, content: [{ type: 'text', text }] });

describe('aiService', () => {
  it('sends the deck inside <deck> tags with the action instruction', async () => {
    const client = fakeClient(answer('# Better'));
    const result = await enhanceMarkdown('# Hi', 'improve', { client });
    assert.equal(result.markdown, '# Better');
    const userMessage = client.calls[0].messages.at(-1).content;
    assert.equal(client.calls[0].system.includes('<deck> tags'), true);
    assert.match(userMessage, /<deck>\n# Hi\n<\/deck>/);
    assert.match(userMessage, /Improve the wording/);
  });

  it('strips a wrapping markdown code fence', () => {
    assert.equal(stripWrappingFence('```markdown\n# A\n---\n# B\n```'), '# A\n---\n# B');
    assert.equal(stripWrappingFence('# A\n```js\nx\n```'), '# A\n```js\nx\n```');
  });

  it('rejects unknown actions and oversized content', async () => {
    const client = fakeClient(answer('x'));
    await assert.rejects(enhanceMarkdown('# Hi', 'toString', { client }), { code: 'INVALID_ACTION' });
    await assert.rejects(enhanceMarkdown('a'.repeat(MAX_AI_CHARS + 1), 'improve', { client }), { code: 'AI_CONTENT_TOO_LARGE' });
    assert.equal(client.calls.length, 0);
  });

  it('rejects empty, refused and truncated AI responses', async () => {
    await assert.rejects(enhanceMarkdown('# Hi', 'notes', { client: fakeClient(answer('  ')) }), { code: 'AI_EMPTY' });
    await assert.rejects(enhanceMarkdown('# Hi', 'notes', { client: fakeClient(answer('', 'refusal')) }), { code: 'AI_REFUSED' });
    await assert.rejects(enhanceMarkdown('# Hi', 'notes', { client: fakeClient(answer('# Half', 'max_tokens')) }), { code: 'AI_OUTPUT_TOO_LONG' });
  });

  it('maps provider errors to friendly messages without leaking details', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal(mapAIError({ status: 401, message: 'invalid x-api-key sk-ant-123' }).code, 'AI_AUTH');
      assert.equal(mapAIError({ status: 429 }).status, 429);
      assert.equal(mapAIError({ name: 'APIConnectionTimeoutError' }).code, 'AI_TIMEOUT');
      const generic = mapAIError(new Error('internal sk-ant-123'));
      assert.equal(generic.code, 'AI_ERROR');
      assert.doesNotMatch(generic.message, /sk-/);

      const failing = fakeClient(() => {
        throw Object.assign(new Error('quota'), { status: 429 });
      });
      await assert.rejects(enhanceMarkdown('# Hi', 'improve', { client: failing }), { code: 'AI_RATE_LIMIT' });
    } finally {
      console.error = original;
    }
  });
});

describe('AI API without a key', () => {
  let server;
  let savedKey;
  before(async () => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    server = await startTestServer();
  });
  after(async () => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    await server.close();
  });

  it('reports AI as not configured and lists actions', async () => {
    const body = await (await fetch(`${server.baseUrl}/api/ai/status`)).json();
    assert.equal(body.configured, false);
    assert.ok(body.actions.some((a) => a.id === 'notes'));
  });

  it('returns a clear 503 when enhancing', async () => {
    const res = await fetch(`${server.baseUrl}/api/ai/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# Hi', action: 'improve' }),
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, 'AI_NOT_CONFIGURED');
  });
});
