/**
 * Browser stand-in for the OpenAI SDK. The GitHub Pages build only talks to Ollama, through its
 * own fetch client (see ../api.js); server/services/aiService.js just needs the error classes.
 */
export default class OpenAI {
  static APIConnectionError = class APIConnectionError extends Error {};

  static APIConnectionTimeoutError = class APIConnectionTimeoutError extends Error {};

  constructor() {
    throw new Error('The OpenAI SDK is not available in the browser-only version.');
  }
}
