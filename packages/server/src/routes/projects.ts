import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';

function getDb(req: Request): ServerDatabase {
  return req.app.locals.db as ServerDatabase;
}

function getWss(req: Request): WebSocketManager | undefined {
  return req.app.locals.wss as WebSocketManager | undefined;
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

      // Auto-create agents if teamPreset provided
      if (req.body.teamPreset) {
        const { TEAM_PRESETS, AgentVisualState, assignPosition } = await import('@mct-madev/core');
        const preset = TEAM_PRESETS[req.body.teamPreset as keyof typeof TEAM_PRESETS];
        if (preset) {
          const createdAgents: any[] = [];
          const defaultNames: Record<string, string[]> = {
            PM: ['Alice', 'Brian'],
            DEVELOPER: ['Bob', 'Charlie', 'Dave', 'Emma'],
            REVIEWER: ['Diana', 'Grace'],
            TESTER: ['Eve', 'Henry'],
            DEVOPS: ['Frank', 'Ivan'],
          };
          for (const rd of preset) {
            const names = defaultNames[rd.role] ?? ['Agent'];
            for (let i = 0; i < rd.count; i++) {
              const agentName = names[i] ?? `${rd.role}-${i + 1}`;
              const position = assignPosition(rd.role, createdAgents);
              const agent = await db.createAgent({
                projectId: project.id,
                name: agentName,
                role: rd.role as any,
                provider: config.defaultProvider ?? 'anthropic',
                model: config.defaultModel ?? 'claude-sonnet-4-5',
                visualState: AgentVisualState.IDLE,
                position,
                metadata: {},
              });
              createdAgents.push(agent);
            }
          }
        }
      }

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

  // POST /projects/:id/suspend
  router.post('/:id/suspend', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const project = await db.getProject(id);
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
      if (project.status === 'SUSPENDED') { res.status(400).json({ error: 'Project is already suspended' }); return; }

      await db.updateProject(id, { status: 'SUSPENDED' } as any);

      // Move all agents to Break Room
      const agents = await db.listAgents(id);
      const breakPositions = (await import('@mct-madev/core')).BREAK_ROOM_POSITIONS;
      for (let i = 0; i < agents.length; i++) {
        const pos = breakPositions[i % breakPositions.length];
        const updated = await db.updateAgent(agents[i].id, { visualState: 'WALKING' as any, position: pos } as any);
        if (wss) {
          setTimeout(() => {
            wss.broadcastToProject(id, { type: 'agent:update' as any, timestamp: new Date().toISOString(), payload: updated });
          }, i * 300);
        }
      }

      if (wss) {
        wss.broadcastToProject(id, { type: 'project:status_changed' as any, timestamp: new Date().toISOString(), payload: { projectId: id, previousStatus: project.status ?? 'ACTIVE', newStatus: 'SUSPENDED' } });
      }

      const updated = await db.getProject(id);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to suspend project', detail: String(err) });
    }
  });

  // POST /projects/:id/resume
  router.post('/:id/resume', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const project = await db.getProject(id);
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
      if (project.status !== 'SUSPENDED' && project.status !== 'CLOSED') { res.status(400).json({ error: 'Project is not suspended' }); return; }

      await db.updateProject(id, { status: 'ACTIVE' } as any);

      // Move agents back to their role positions
      const agents = await db.listAgents(id);
      const { assignPosition } = await import('@mct-madev/core');
      const placed: any[] = [];
      for (let i = 0; i < agents.length; i++) {
        const pos = assignPosition(agents[i].role, placed);
        placed.push({ ...agents[i], position: pos });
        const updated = await db.updateAgent(agents[i].id, { visualState: 'WALKING' as any, position: pos } as any);
        if (wss) {
          setTimeout(() => {
            wss.broadcastToProject(id, { type: 'agent:update' as any, timestamp: new Date().toISOString(), payload: updated });
          }, i * 300);
        }
      }

      if (wss) {
        wss.broadcastToProject(id, { type: 'project:status_changed' as any, timestamp: new Date().toISOString(), payload: { projectId: id, previousStatus: project.status, newStatus: 'ACTIVE' } });
      }

      const updated = await db.getProject(id);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to resume project', detail: String(err) });
    }
  });

  // POST /projects/:id/close
  router.post('/:id/close', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const project = await db.getProject(id);
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

      await db.updateProject(id, { status: 'CLOSED' } as any);

      // Move all agents to Break Room
      const agents = await db.listAgents(id);
      const breakPositions = (await import('@mct-madev/core')).BREAK_ROOM_POSITIONS;
      for (let i = 0; i < agents.length; i++) {
        const pos = breakPositions[i % breakPositions.length];
        const updated = await db.updateAgent(agents[i].id, { visualState: 'WALKING' as any, position: pos } as any);
        if (wss) {
          setTimeout(() => {
            wss.broadcastToProject(id, { type: 'agent:update' as any, timestamp: new Date().toISOString(), payload: updated });
          }, i * 300);
        }
      }

      if (wss) {
        wss.broadcastToProject(id, { type: 'project:status_changed' as any, timestamp: new Date().toISOString(), payload: { projectId: id, previousStatus: project.status ?? 'ACTIVE', newStatus: 'CLOSED' } });
      }

      const updated = await db.getProject(id);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to close project', detail: String(err) });
    }
  });

  return router;
}
