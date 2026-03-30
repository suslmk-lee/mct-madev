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

  // GET /projects/:projectId/orgchart — returns hierarchical org tree
  router.get('/projects/:projectId/orgchart', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const agents = await db.listAgents(param(req, 'projectId'));

      type OrgNode = typeof agents[number] & { reports: OrgNode[] };
      const nodeMap = new Map<string, OrgNode>();
      for (const a of agents) nodeMap.set(a.id, { ...a, reports: [] });

      const roots: OrgNode[] = [];
      for (const node of nodeMap.values()) {
        if (node.managerId && nodeMap.has(node.managerId)) {
          nodeMap.get(node.managerId)!.reports.push(node);
        } else {
          roots.push(node);
        }
      }

      res.json({ data: roots });
    } catch (err) {
      sendError(res, 500, 'Failed to build org chart', err);
    }
  });

  // POST /projects/:projectId/agents
  router.post('/projects/:projectId/agents', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const { name, role, provider, model, systemPrompt, position, monthlyBudgetTokens, heartbeatCron, metadata } = req.body;

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
      if (monthlyBudgetTokens !== undefined && (typeof monthlyBudgetTokens !== 'number' || monthlyBudgetTokens <= 0)) {
        res.status(400).json({ error: 'monthlyBudgetTokens must be a positive number' });
        return;
      }
      if (heartbeatCron !== undefined && heartbeatCron !== null) {
        const { default: cronLib } = await import('node-cron');
        if (!cronLib.validate(heartbeatCron)) {
          res.status(400).json({ error: 'heartbeatCron is not a valid cron expression (e.g. "0 * * * *")' });
          return;
        }
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
        monthlyBudgetTokens: typeof monthlyBudgetTokens === 'number' ? monthlyBudgetTokens : undefined,
        heartbeatCron: typeof heartbeatCron === 'string' ? heartbeatCron : undefined,
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

      const { monthlyBudgetTokens: budgetUpdate, heartbeatCron: cronUpdate, ...otherUpdates } = req.body;
      if (cronUpdate !== undefined && cronUpdate !== null) {
        const { default: cronLib } = await import('node-cron');
        if (!cronLib.validate(cronUpdate)) {
          res.status(400).json({ error: 'heartbeatCron is not a valid cron expression' });
          return;
        }
      }
      if (budgetUpdate !== undefined && (typeof budgetUpdate !== 'number' || budgetUpdate <= 0) && budgetUpdate !== null) {
        res.status(400).json({ error: 'monthlyBudgetTokens must be a positive number or null to remove' });
        return;
      }
      const updatePayload = {
        ...otherUpdates,
        ...(budgetUpdate !== undefined ? { monthlyBudgetTokens: budgetUpdate ?? undefined } : {}),
        ...(cronUpdate !== undefined ? { heartbeatCron: cronUpdate ?? undefined } : {}),
      };
      const updated = await db.updateAgent(id, updatePayload);

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

  // POST /agents/:id/approve — approve a PENDING agent
  router.post('/agents/:id/approve', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const existing = await db.getAgent(id);
      if (!existing) { res.status(404).json({ error: 'Agent not found' }); return; }
      const updated = await db.updateAgent(id, { approvalStatus: 'APPROVED', approvedAt: new Date().toISOString() });
      if (wss) wss.broadcastToProject(updated.projectId, { type: 'agent:update' as never, timestamp: new Date().toISOString(), payload: updated });
      logger.info({ agentId: id }, 'Agent approved');
      res.json({ data: updated });
    } catch (err) { sendError(res, 500, 'Failed to approve agent', err); }
  });

  // POST /agents/:id/suspend — suspend an active agent
  router.post('/agents/:id/suspend', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const existing = await db.getAgent(id);
      if (!existing) { res.status(404).json({ error: 'Agent not found' }); return; }
      const updated = await db.updateAgent(id, { approvalStatus: 'SUSPENDED' });
      if (wss) wss.broadcastToProject(updated.projectId, { type: 'agent:update' as never, timestamp: new Date().toISOString(), payload: updated });
      logger.info({ agentId: id }, 'Agent suspended');
      res.json({ data: updated });
    } catch (err) { sendError(res, 500, 'Failed to suspend agent', err); }
  });

  // POST /agents/:id/terminate — permanently terminate an agent
  router.post('/agents/:id/terminate', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const existing = await db.getAgent(id);
      if (!existing) { res.status(404).json({ error: 'Agent not found' }); return; }
      const updated = await db.updateAgent(id, { approvalStatus: 'TERMINATED' });
      if (wss) wss.broadcastToProject(updated.projectId, { type: 'agent:update' as never, timestamp: new Date().toISOString(), payload: updated });
      logger.warn({ agentId: id }, 'Agent terminated');
      res.json({ data: updated });
    } catch (err) { sendError(res, 500, 'Failed to terminate agent', err); }
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
