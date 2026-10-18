import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import {
  MAX_AI_CHARS,
  applySpeakerNotes,
  enhanceMarkdown,
  getProviderStatus,
  mapOpenAIError,
  parseNotesJson,
  stripWrappingFence,
} from '../services/aiService.js';

/** A stand-in for the OpenAI client that records the request and returns a canned answer. */
function fakeClient(respond) {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (request) => {
          calls.push(request);
          return respond(request);
        },
      },
    },
  };
}

const answer = (content) => () => ({ choices: [{ message: { content } }] });

describe('aiService', () => {
  it('sends the deck inside <deck> tags with the action instruction', async () => {
    const client = fakeClient(answer('# Better'));
    const result = await enhanceMarkdown('# Hi', 'improve', { client });
    assert.equal(result.markdown, '# Better');
    const userMessage = client.calls[0].messages.at(-1).content;
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

  it('rejects empty AI responses', async () => {
    await assert.rejects(enhanceMarkdown('# Hi', 'notes', { client: fakeClient(answer('  ')) }), { code: 'AI_EMPTY' });
  });

  it('maps provider errors to friendly messages without leaking details', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal(mapOpenAIError({ status: 401, message: 'Incorrect API key sk-123' }).code, 'AI_AUTH');
      assert.equal(mapOpenAIError({ status: 429 }).status, 429);
      assert.equal(mapOpenAIError({ name: 'APIConnectionTimeoutError' }).code, 'AI_TIMEOUT');
      const generic = mapOpenAIError(new Error('internal sk-123'));
      assert.equal(generic.code, 'AI_ERROR');
      assert.doesNotMatch(generic.message, /sk-123/);

      const failing = fakeClient(() => {
        throw Object.assign(new Error('quota'), { status: 429 });
      });
      await assert.rejects(enhanceMarkdown('# Hi', 'improve', { client: failing }), { code: 'AI_RATE_LIMIT' });
    } finally {
      console.error = original;
    }
  });
});

describe('speaker notes + presenter script', () => {
  const deck = '---\ntitle: Demo\n---\n\n# Welcome\n\n---\n\n## Results\n\n- Up 20%\n\nNote: old notes';

  it('sends only slide content and inserts notes and a question per slide', async () => {
    const client = fakeClient((request) => {
      assert.deepEqual(request.response_format, { type: 'json_object' });
      return answer(
        JSON.stringify({
          slides: [
            { slide: 1, notes: 'Say hello.', question: 'Why are we here?' },
            { slide: 2, notes: 'Growth was\nstrong.\n---', question: 'What drove it?' },
          ],
        }),
      )();
    });
    const result = await enhanceMarkdown(deck, 'notes', { client });
    const userMessage = client.calls[0].messages.at(-1).content;
    assert.match(userMessage, /<slide n="2">\n## Results\n\n- Up 20%\n<\/slide>/);
    assert.doesNotMatch(userMessage, /old notes/);

    assert.match(result.markdown, /^---\ntitle: Demo\n---\n\n# Welcome\n\nNote: Say hello\.\nQuestion for the audience: Why are we here\?/);
    // Line breaks are flattened, so a stray "---" cannot start a new slide.
    assert.match(result.markdown, /Note: Growth was strong\. ---\nQuestion for the audience: What drove it\?/);
    assert.doesNotMatch(result.markdown, /old notes/);
  });

  it('keeps existing notes for slides the model skipped', () => {
    const output = applySpeakerNotes(deck, [{ slide: 1, notes: 'Hi', question: '' }]);
    assert.match(output, /# Welcome\n\nNote: Hi\n\n---/);
    assert.match(output, /Note: old notes\n$/);
  });

  it('reads JSON wrapped in a code fence and rejects unreadable answers', async () => {
    assert.deepEqual(parseNotesJson('```json\n{"slides":[{"slide":1}]}\n```'), [{ slide: 1 }]);
    assert.equal(parseNotesJson('no json here'), null);
    await assert.rejects(enhanceMarkdown(deck, 'notes', { client: fakeClient(answer('sorry')) }), { code: 'AI_BAD_FORMAT' });
  });
});

describe('AI providers', () => {
  it('uses the Ollama model when the local provider is chosen', async () => {
    const client = fakeClient(answer('# Better'));
    const result = await enhanceMarkdown('# Hi', 'improve', { provider: 'ollama', client });
    assert.equal(result.provider, 'ollama');
    assert.equal(client.calls[0].model, result.model);
    assert.equal(client.calls[0].reasoning_effort, 'none');
  });

  it('rejects unknown providers', async () => {
    await assert.rejects(enhanceMarkdown('# Hi', 'improve', { provider: 'claude', client: fakeClient(answer('x')) }), {
      code: 'INVALID_PROVIDER',
    });
  });

  it('reports whether Ollama is running and has the model', async () => {
    const tags = (names) => async () => ({ ok: true, json: async () => ({ models: names.map((name) => ({ name, model: name })) }) });
    const model = (await getProviderStatus({ fetchImpl: tags([]) })).find((p) => p.id === 'ollama').model;

    const ready = (await getProviderStatus({ fetchImpl: tags([model]) })).find((p) => p.id === 'ollama');
    assert.equal(ready.available, true);
    const missing = (await getProviderStatus({ fetchImpl: tags(['other:1b']) })).find((p) => p.id === 'ollama');
    assert.equal(missing.available, false);
    assert.match(missing.reason, /ollama pull/);
    const down = await getProviderStatus({
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    assert.match(down.find((p) => p.id === 'ollama').reason, /not running/);
  });

  it('explains Ollama connection errors', () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.match(mapOpenAIError({ name: 'APIConnectionError' }, 'ollama').message, /Ollama/);
      assert.equal(mapOpenAIError({ status: 404 }, 'ollama').code, 'AI_MODEL_MISSING');
    } finally {
      console.error = original;
    }
  });
});

describe('AI API without a key or a local model', () => {
  let server;
  const saved = {};
  before(async () => {
    for (const key of ['OPENAI_API_KEY', 'OLLAMA_BASE_URL', 'AI_PROVIDER']) saved[key] = process.env[key];
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER;
    // Nothing listens on port 9, so Ollama looks stopped even if it runs on this machine.
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9';
    server = await startTestServer();
  });
  after(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await server.close();
  });

  it('reports AI as not configured and lists providers and actions', async () => {
    const body = await (await fetch(`${server.baseUrl}/api/ai/status`)).json();
    assert.equal(body.configured, false);
    assert.equal(body.defaultProvider, 'ollama');
    assert.deepEqual(
      body.providers.map((p) => [p.id, p.available]),
      [
        ['openai', false],
        ['ollama', false],
      ],
    );
    assert.ok(body.actions.some((a) => a.id === 'notes'));
  });

  it('returns a clear 503 when enhancing with OpenAI', async () => {
    const res = await fetch(`${server.baseUrl}/api/ai/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# Hi', action: 'improve', provider: 'openai' }),
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, 'AI_NOT_CONFIGURED');
  });
});
