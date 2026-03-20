import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';

function getDb(req: Request): ServerDatabase {
  return req.app.locals.db as ServerDatabase;
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

export function createProjectsRouter(): Router {
  const router = Router();

  // GET /projects
  router.get('/', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const projects = await db.listProjects();
      res.json({ data: projects, total: projects.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list projects', detail: String(err) });
    }
  });

  // POST /projects
  router.post('/', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const { name, description, repoPath, config } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required and must be a string' });
        return;
      }
      if (!config || typeof config !== 'object') {
        res.status(400).json({ error: 'config is required and must be an object' });
        return;
      }

      const project = await db.createProject({ name, description, repoPath, config });
      res.status(201).json({ data: project });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create project', detail: String(err) });
    }
  });

  // GET /projects/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const project = await db.getProject(param(req, 'id'));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ data: project });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get project', detail: String(err) });
    }
  });

  // PUT /projects/:id
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const existing = await db.getProject(param(req, 'id'));
      if (!existing) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const updated = await db.updateProject(param(req, 'id'), req.body);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update project', detail: String(err) });
    }
  });

  // DELETE /projects/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const existing = await db.getProject(param(req, 'id'));
      if (!existing) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      await db.deleteProject(param(req, 'id'));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete project', detail: String(err) });
    }
  });

  return router;
}
