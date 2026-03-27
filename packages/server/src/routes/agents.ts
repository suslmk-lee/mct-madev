import { Router, type Request, type Response } from 'express';
import { sendError } from '../routeError.js';
import { isValidProvider, isValidRole, NAME_MAX_LENGTH, SYSTEM_PROMPT_MAX_LENGTH, VALID_PROVIDERS, VALID_ROLES } from '../validation.js';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';
import type { AgentRole } from '@mct-madev/core';
import { AgentVisualState, EventType, assignPosition, type SystemEvent, type AgentStatePayload } from '@mct-madev/core';
import { logger } from '../logger.js';

const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  DEVELOPER: 'You are a software developer. Write clean, complete, production-ready code. Use write_file tool for all file outputs.',
  REVIEWER: 'You are a code reviewer. Review for correctness, security, and performance. Use write_file for any corrections.',
  TESTER: 'You are a QA engineer. Write comprehensive tests. Use write_file for test files.',
  DEVOPS: 'You are a DevOps engineer. Handle deployment, CI/CD, and infrastructure. Use write_file for configs.',
  PM: 'You are a project manager. Coordinate tasks and ensure quality deliverables.',
};

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

export function createAgentsRouter(): Router {
  const router = Router();

  // GET /projects/:projectId/agents
  router.get('/projects/:projectId/agents', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const agents = await db.listAgents(param(req, 'projectId'));
      res.json({ data: agents, total: agents.length });
    } catch (err) {
      sendError(res, 500, 'Failed to list agents', err);
    }
  });

  // POST /projects/:projectId/agents
  router.post('/projects/:projectId/agents', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const { name, role, provider, model, systemPrompt, position, metadata } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required and must be a string' });
        return;
      }
      if (!role || typeof role !== 'string') {
        res.status(400).json({ error: 'role is required and must be a string' });
        return;
      }
      if (!provider || typeof provider !== 'string') {
        res.status(400).json({ error: 'provider is required and must be a string' });
        return;
      }
      if (!model || typeof model !== 'string' || model.trim().length === 0) {
        res.status(400).json({ error: 'model is required' });
        return;
      }

      if (!isValidProvider(provider)) {
        res.status(400).json({ error: `Unknown provider. Valid values: ${VALID_PROVIDERS.join(', ')}` });
        return;
      }
      if (!isValidRole(role)) {
        res.status(400).json({ error: `Unknown role. Valid values: ${VALID_ROLES.join(', ')}` });
        return;
      }
      if (name.trim().length > NAME_MAX_LENGTH) {
        res.status(400).json({ error: `name exceeds max length (${NAME_MAX_LENGTH})` });
        return;
      }
      if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.length > SYSTEM_PROMPT_MAX_LENGTH) {
        res.status(400).json({ error: `systemPrompt exceeds max length (${SYSTEM_PROMPT_MAX_LENGTH})` });
        return;
      }

      const projectId = param(req, 'projectId');

      // Apply role-based default system prompt if not provided
      const effectiveSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPTS[role] || undefined;

      // Auto-assign position based on role if not provided
      let agentPosition = position;
      if (!agentPosition) {
        const existingAgents = await db.listAgents(projectId);
        agentPosition = assignPosition(role, existingAgents);
      }

      const agent = await db.createAgent({
        projectId,
        name,
        role: role as AgentRole,
        provider,
        model,
        systemPrompt: effectiveSystemPrompt,
        visualState: AgentVisualState.IDLE,
        position: agentPosition,
        metadata: metadata ?? {},
      });
      res.status(201).json({ data: agent });
    } catch (err) {
      sendError(res, 500, 'Failed to create agent', err);
    }
  });

  // GET /agents/:id
  router.get('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const agent = await db.getAgent(param(req, 'id'));
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ data: agent });
    } catch (err) {
      sendError(res, 500, 'Failed to get agent', err);
    }
  });

  // PUT /agents/:id
  router.put('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');

      const existing = await db.getAgent(id);
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const updated = await db.updateAgent(id, req.body);

      // Broadcast visual state change if it changed
      if (req.body.visualState && req.body.visualState !== existing.visualState && wss) {
        const event: SystemEvent<AgentStatePayload> = {
          type: EventType.AGENT_STATE_CHANGED,
          timestamp: new Date().toISOString(),
          payload: {
            agentId: updated.id,
            previousState: existing.visualState,
            newState: updated.visualState,
            position: updated.position,
          },
        };
        wss.broadcastToProject(updated.projectId, event);
      }

      res.json({ data: updated });
    } catch (err) {
      sendError(res, 500, 'Failed to update agent', err);
    }
  });

  // DELETE /agents/:id
  router.delete('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const id = param(req, 'id');

      const existing = await db.getAgent(id);
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const activeTasks = await db.listTasks(existing.projectId, { assigneeAgentId: id, status: 'IN_PROGRESS' as import('@mct-madev/core').TaskStatus });
      if (activeTasks.length > 0) {
        logger.warn({ agentId: id, activeTasks: activeTasks.length }, 'Deleting agent with active tasks');
      }

      await db.deleteAgent(id);

      const wss = getWss(req);
      if (wss) {
        wss.broadcastToProject(existing.projectId, {
          type: 'agent:deleted' as unknown as EventType,
          timestamp: new Date().toISOString(),
          payload: { id },
        });
      }

      res.status(204).end();
    } catch (err) {
      sendError(res, 500, 'Failed to delete agent', err);
    }
  });

  return router;
}
