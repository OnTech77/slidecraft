/**
 * Thin client for the Slidecraft API. Every failure becomes an ApiError with a
 * message that is safe and friendly enough to show directly in the UI.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

const OFFLINE_MESSAGE = "Can't reach the Slidecraft server. Make sure it is running on port 3001 and try again.";
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class ApiError extends Error {
  constructor(message, { code = 'UNKNOWN', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const isAbortError = (err) => err?.name === 'AbortError';

async function request(path, { method = 'GET', json, body, signal, as = 'json' } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: json === undefined ? body : JSON.stringify(json),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError(OFFLINE_MESSAGE, { code: 'NETWORK' });
  }

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Not JSON: usually the dev proxy reporting that the server is down.
    }
    if (payload?.error?.message) {
      throw new ApiError(payload.error.message, { code: payload.error.code, status: response.status });
    }
    const offline = response.status >= 500;
    throw new ApiError(offline ? OFFLINE_MESSAGE : GENERIC_MESSAGE, { code: offline ? 'NETWORK' : 'UNKNOWN', status: response.status });
  }

  return as === 'blob' ? response.blob() : response.json();
}

export const api = {
  getThemes: () => request('/api/themes'),

  getAIStatus: () => request('/api/ai/status'),

  getSample: () => request('/api/slides/sample'),

  parseMarkdown: (markdown, { signal } = {}) => request('/api/slides/parse', { method: 'POST', json: { markdown }, signal }),

  uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    return request('/api/slides/upload', { method: 'POST', body: form });
  },

  enhance: (markdown, action, { signal } = {}) => request('/api/ai/enhance', { method: 'POST', json: { markdown, action }, signal }),

  exportDeck: (format, { markdown, theme, transition, filename }) =>
    request(`/api/export/${format}`, { method: 'POST', json: { markdown, theme, transition, filename }, as: 'blob' }),
};
