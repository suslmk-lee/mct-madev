import { Router, type Request, type Response } from 'express';
import { sendError } from '../routeError.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';

/** Convert a project name to a safe directory slug */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

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
      sendError(res, 500, 'Failed to list projects', err);
    }
  });

  // POST /projects
  router.post('/', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const { name, description, repoPath, config } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'MISSING_NAME', message: 'name은 필수 문자열입니다.' });
        return;
      }
      if (!config || typeof config !== 'object') {
        res.status(400).json({ error: 'MISSING_CONFIG', message: 'config 객체가 필요합니다.' });
        return;
      }

      // Resolve effective repo path (auto-create if not provided)
      let effectiveRepoPath: string | undefined;
      if (repoPath && typeof repoPath === 'string' && repoPath.trim()) {
        effectiveRepoPath = repoPath.trim();
        try {
          mkdirSync(effectiveRepoPath, { recursive: true });
        } catch (mkErr) {
          res.status(400).json({
            error: 'INVALID_REPO_PATH',
            message: `경로를 생성할 수 없습니다: ${effectiveRepoPath}`,
            hint: '절대 경로를 입력하세요 (예: C:\\Users\\user\\projects\\my-app)',
          });
          return;
        }
      } else {
        // Auto-generate path under ~/mct-madev-projects/{slug}
        effectiveRepoPath = join(homedir(), 'mct-madev-projects', slugify(name));
        mkdirSync(effectiveRepoPath, { recursive: true });
      }

      const project = await db.createProject({ name, description, repoPath: effectiveRepoPath, config });

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
      sendError(res, 500, 'Failed to create project', err);
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
      sendError(res, 500, 'Failed to get project', err);
    }
  });

  // PUT /projects/:id
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const id = param(req, 'id');
      const existing = await db.getProject(id);
      if (!existing) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const updates = req.body;
      if (updates.repoPath && updates.repoPath !== existing.repoPath) {
        if (!existsSync(updates.repoPath)) {
          res.status(400).json({ error: 'repoPath does not exist on disk' });
          return;
        }
      }
      const updated = await db.updateProject(id, updates);
      res.json({ data: updated });
    } catch (err) {
      sendError(res, 500, 'Failed to update project', err);
    }
  });

  // DELETE /projects/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const id = param(req, 'id');
      const existing = await db.getProject(id);
      if (!existing) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      // Refuse deletion if tasks are still running
      const runningTasks = await db.listTasks(id, { status: 'IN_PROGRESS' as import('@mct-madev/core').TaskStatus });
      if (runningTasks.length > 0) {
        res.status(409).json({
          error: 'TASKS_RUNNING',
          message: `${runningTasks.length}개 태스크가 실행 중입니다. 완료 후 삭제하세요.`,
        });
        return;
      }
      await db.deleteProject(id);
      res.status(204).send();
    } catch (err) {
      sendError(res, 500, 'Failed to delete project', err);
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

      // Move all agents to Break Room in parallel (no race condition on suspend)
      const agents = await db.listAgents(id);
      const breakPositions = (await import('@mct-madev/core')).BREAK_ROOM_POSITIONS;
      await Promise.all(agents.map(async (agent, i) => {
        const pos = breakPositions[i % breakPositions.length];
        const updated = await db.updateAgent(agent.id, { visualState: 'WALKING' as any, position: pos } as any);
        if (wss) {
          wss.broadcastToProject(id, { type: 'agent:update' as any, timestamp: new Date().toISOString(), payload: updated });
        }
      }));

      if (wss) {
        wss.broadcastToProject(id, { type: 'project:status_changed' as any, timestamp: new Date().toISOString(), payload: { projectId: id, previousStatus: project.status ?? 'ACTIVE', newStatus: 'SUSPENDED' } });
        wss.broadcastToProject(id, {
          type: 'chat:message' as never,
          timestamp: new Date().toISOString(),
          payload: {
            role: 'assistant',
            content: '⏸ 프로젝트가 일시중지되었습니다. 모든 에이전트가 Break Room으로 이동했습니다.',
            sender: 'System',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const updated = await db.getProject(id);
      res.json({ data: updated });
    } catch (err) {
      sendError(res, 500, 'Failed to suspend project', err);
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
      sendError(res, 500, 'Failed to resume project', err);
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

      // Move all agents to Break Room in parallel (no race condition on suspend)
      const agents = await db.listAgents(id);
      const breakPositions = (await import('@mct-madev/core')).BREAK_ROOM_POSITIONS;
      await Promise.all(agents.map(async (agent, i) => {
        const pos = breakPositions[i % breakPositions.length];
        const updated = await db.updateAgent(agent.id, { visualState: 'WALKING' as any, position: pos } as any);
        if (wss) {
          wss.broadcastToProject(id, { type: 'agent:update' as any, timestamp: new Date().toISOString(), payload: updated });
        }
      }));

      if (wss) {
        wss.broadcastToProject(id, { type: 'project:status_changed' as any, timestamp: new Date().toISOString(), payload: { projectId: id, previousStatus: project.status ?? 'ACTIVE', newStatus: 'CLOSED' } });
      }

      const updated = await db.getProject(id);
      res.json({ data: updated });
    } catch (err) {
      sendError(res, 500, 'Failed to close project', err);
    }
  });

  // GET /projects/:id/usage — token usage summary
  router.get('/:id/usage', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const id = param(req, 'id');
      const project = await db.getProject(id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (!db.getTokenUsage) {
        res.json({ data: { totalInputTokens: 0, totalOutputTokens: 0, byProvider: {}, byAgent: {} } });
        return;
      }
      const usage = await db.getTokenUsage(id);
      res.json({ data: usage });
    } catch (err) {
      sendError(res, 500, 'Failed to get token usage', err);
    }
  });

  return router;
}
