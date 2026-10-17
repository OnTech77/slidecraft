import multer from 'multer';

/**
 * An error whose message is safe to show to users.
 * Anything that is not an AppError is reported to the client as a generic failure.
 */
export class AppError extends Error {
  constructor(status, code, message, { cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST') => new AppError(400, code, message);

const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again.';

/** Map any thrown value to a status code and a user-safe { code, message } body. */
export function toSafeError(err) {
  if (err instanceof AppError) {
    return { status: err.status, body: { code: err.code, message: err.message } };
  }

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'That file is too large. The maximum size is 10 MB.',
      LIMIT_FILE_COUNT: 'Please upload one file at a time.',
      LIMIT_UNEXPECTED_FILE: 'Please upload one file using the "file" field.',
    };
    return {
      status: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
      body: { code: err.code, message: messages[err.code] ?? 'The upload could not be processed.' },
    };
  }

  // Errors raised by express.json() body parsing.
  if (err?.type === 'entity.too.large') {
    return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE', message: 'Your content is too large. The maximum size is 10 MB.' } };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } };
  }

  return { status: 500, body: { code: 'INTERNAL_ERROR', message: GENERIC_MESSAGE } };
}

/** Express error middleware: log full details server-side, send only safe details to the client. */
export function errorHandler(err, req, res, _next) {
  const { status, body } = toSafeError(err);
  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: body });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That endpoint does not exist.' } });
}

/** Wrap an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
