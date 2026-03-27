import { Router, type Request, type Response } from 'express';

const KNOWN_PROVIDERS = [
  { name: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { name: 'openai', envKey: 'OPENAI_API_KEY' },
  { name: 'google', envKey: 'GOOGLE_API_KEY' },
  { name: 'ollama', envKey: null },
  { name: 'kimi', envKey: 'KIMI_API_KEY' },
  { name: 'minimax', envKey: 'MINIMAX_API_KEY' },
  { name: 'glm', envKey: 'GLM_API_KEY' },
];

export function createProvidersRouter(): Router {
  const router = Router();

  // GET /providers — list available providers with active status
  router.get('/', (_req: Request, res: Response) => {
    const providers = KNOWN_PROVIDERS.map((p) => ({
      name: p.name,
      active: p.envKey
        ? (process.env[p.envKey] ?? '').trim().length > 0
        : p.name === 'ollama', // Ollama is active if no key needed (local)
    }));
    res.json({ providers });
  });

  return router;
}
