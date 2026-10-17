import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateMarkdown } from '../utils/validation.js';
import { enhanceMarkdown, getModel, isAIConfigured, listActions } from '../services/aiService.js';

// Without user accounts, anyone who can reach the server can spend the Anthropic credit,
// so cap AI requests per IP address.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message: 'You have made a lot of AI requests. Please wait a few minutes and try again.' },
    });
  },
});

export const aiRouter = Router();

aiRouter.get('/status', (req, res) => {
  const configured = isAIConfigured();
  res.json({ configured, model: configured ? getModel() : null, actions: listActions() });
});

aiRouter.post('/enhance', aiLimiter, async (req, res) => {
  const markdown = validateMarkdown(req.body?.markdown);
  res.json(await enhanceMarkdown(markdown, req.body?.action));
});
