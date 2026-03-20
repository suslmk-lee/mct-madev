import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';
import type { AgentRole } from '@mct-madev/core';
import { AgentVisualState, EventType, assignPosition, type SystemEvent, type AgentStatePayload } from '@mct-madev/core';

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
      res.status(500).json({ error: 'Failed to list agents', detail: String(err) });
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
      if (!model || typeof model !== 'string') {
        res.status(400).json({ error: 'model is required and must be a string' });
        return;
      }

      const projectId = param(req, 'projectId');

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
        systemPrompt,
        visualState: AgentVisualState.IDLE,
        position: agentPosition,
        metadata: metadata ?? {},
      });
      res.status(201).json({ data: agent });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create agent', detail: String(err) });
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
      res.status(500).json({ error: 'Failed to get agent', detail: String(err) });
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
      res.status(500).json({ error: 'Failed to update agent', detail: String(err) });
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
      res.status(500).json({ error: 'Failed to delete agent', detail: String(err) });
    }
  });

  return router;
}
