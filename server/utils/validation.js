import { AppError, badRequest } from './errors.js';

export const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024; // 10 MB, same as the upload limit

// Control characters other than tab, newline and carriage return have no place in Markdown.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Normalize line endings and strip control characters. */
export function sanitizeMarkdownInput(text) {
  return text.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '');
}

/**
 * Validate a Markdown string from a request body and return a cleaned copy.
 * @param {unknown} value
 * @param {{ required?: boolean }} [options]
 */
export function validateMarkdown(value, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest('Please add some Markdown content first.', 'MISSING_CONTENT');
    return '';
  }
  if (typeof value !== 'string') {
    throw badRequest('Markdown content must be text.', 'INVALID_CONTENT');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_MARKDOWN_BYTES) {
    throw new AppError(413, 'CONTENT_TOO_LARGE', 'Your content is too large. The maximum size is 10 MB.');
  }
  const cleaned = sanitizeMarkdownInput(value);
  if (required && cleaned.trim() === '') {
    throw badRequest('Please add some Markdown content first.', 'MISSING_CONTENT');
  }
  return cleaned;
}

/** Decode an uploaded file as UTF-8 text, rejecting binary files. */
export function decodeTextFile(buffer) {
  if (buffer.includes(0)) {
    throw badRequest('That file does not look like a text file. Please upload a Markdown (.md) file.', 'INVALID_FILE');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    throw badRequest('That file is not valid UTF-8 text. Please save it as UTF-8 and try again.', 'INVALID_ENCODING');
  }
}
