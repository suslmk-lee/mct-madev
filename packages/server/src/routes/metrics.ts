import { Router, type Request, type Response } from 'express';
import { sendError } from '../routeError.js';
import type { ServerDatabase } from '../database.js';

function getDb(req: Request): ServerDatabase {
  return req.app.locals.db as ServerDatabase;
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

export function createMetricsRouter(): Router {
  const router = Router();

  // GET /projects/:projectId/metrics
  router.get('/projects/:projectId/metrics', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const projectId = param(req, 'projectId');

      if (db.getTokenUsage) {
        const summary = await db.getTokenUsage(projectId);
        res.json({ data: summary });
      } else {
        // Fallback: compute basic metrics from tasks and agents
        const tasks = await db.listTasks(projectId);
        const agents = await db.listAgents(projectId);

        const activeAgents = agents.filter(
          (a) => a.visualState === 'WORKING' || a.visualState === 'THINKING',
        ).length;
        const pendingTasks = tasks.filter(
          (t) => t.status === 'CREATED' || t.status === 'PLANNING' || t.status === 'APPROVED',
        ).length;
        const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
        const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
        const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;

        res.json({
          data: {
            activeAgents,
            totalAgents: agents.length,
            pendingTasks,
            inProgressTasks,
            completedTasks,
            failedTasks,
            totalTasks: tasks.length,
            tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, byAgent: {} },
          },
        });
      }
    } catch (err) {
      sendError(res, 500, 'Failed to get metrics', err);
    }
  });

  return router;
}
