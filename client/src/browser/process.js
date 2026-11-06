// The server's AI code reads settings from process.env, which browsers don't have.
// An empty one makes it use its defaults (Ollama at localhost:11434 with gemma4:e4b).
globalThis.process ??= { env: {} };
