import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerDatabase } from './database.js';
import type { WebSocketManager } from './websocket/index.js';
import { createApiRouter } from './routes/index.js';
import { logger } from './logger.js';

export interface AppOptions {
  /** Directory to serve static files from (e.g., the built web app) */
  staticDir?: string;
  /** CORS origin configuration */
  corsOrigin?: string | string[] | boolean;
  /** Database instance – required for API routes to function */
  db?: ServerDatabase;
  /** WebSocket manager – attached to app.locals for route handlers */
  wss?: WebSocketManager;
  /** Orchestrator instance for workflow execution */
  orchestrator?: unknown;
  /** Chat function for LLM calls */
  chatFn?: unknown;
  /** Skill loader for .madev skills */
  skillLoader?: unknown;
}

function loadVersion(): string {
  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json',
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const startTime = Date.now();

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const version = loadVersion();

  // --- Expose db and wss via app.locals ---
  if (options.db) {
    app.locals.db = options.db;
  }
  if (options.wss) {
    app.locals.wss = options.wss;
  }
  if (options.orchestrator) {
    app.locals.orchestrator = options.orchestrator;
  }
  if (options.chatFn) {
    app.locals.chatFn = options.chatFn;
  }
  if (options.skillLoader) {
    app.locals.skillLoader = options.skillLoader;
  }

  // --- Middleware ---
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(cors({ origin: options.corsOrigin ?? 'http://localhost:5173' }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // --- Health endpoint ---
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // --- Shutdown endpoint ---
  app.post('/api/shutdown', (_req: Request, res: Response) => {
    res.json({ message: 'Shutting down...' });
    setTimeout(() => process.exit(0), 200);
  });

  // --- API routes ---
  app.use('/api', createApiRouter());

  // --- Error logging middleware ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: String(err), method: req.method, url: req.url }, 'Unhandled server error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Static file serving ---
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    // SPA fallback: serve index.html for non-API routes
    app.get('*', (_req, res) => {
      res.sendFile(resolve(options.staticDir!, 'index.html'));
    });
  }

  return app;
}
