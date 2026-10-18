import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateMarkdown } from '../utils/validation.js';
import { defaultProvider, enhanceMarkdown, getProviderStatus, listActions } from '../services/aiService.js';

// Without user accounts, anyone who can reach the server can spend the OpenAI credit,
// so cap OpenAI requests per IP address. The local model costs nothing, so it is not limited.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.body?.provider === 'ollama',
  handler: (req, res) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message: 'You have made a lot of AI requests. Please wait a few minutes and try again.' },
    });
  },
});

export const aiRouter = Router();

aiRouter.get('/status', async (req, res) => {
  const providers = await getProviderStatus();
  res.json({
    configured: providers.some((p) => p.available),
    defaultProvider: defaultProvider(),
    providers,
    actions: listActions(),
  });
});

aiRouter.post('/enhance', aiLimiter, async (req, res) => {
  const markdown = validateMarkdown(req.body?.markdown);
  const { action, provider, slide, instruction } = req.body ?? {};
  res.json(await enhanceMarkdown(markdown, action, { provider, slide, instruction }));
});
