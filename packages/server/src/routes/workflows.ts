import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';
import { EventType, type SystemEvent, type WorkflowStatusPayload } from '@mct-madev/core';

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

export function createWorkflowsRouter(): Router {
  const router = Router();

  // GET /projects/:projectId/workflows
  router.get('/projects/:projectId/workflows', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const workflows = await db.listWorkflows(param(req, 'projectId'));
      res.json({ data: workflows, total: workflows.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list workflows', detail: String(err) });
    }
  });

  // POST /projects/:projectId/workflows
  router.post('/projects/:projectId/workflows', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const { name, definition } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required and must be a string' });
        return;
      }
      if (!definition || typeof definition !== 'object') {
        res.status(400).json({ error: 'definition is required and must be an object' });
        return;
      }

      const projectId = param(req, 'projectId');
      const workflow = await db.createWorkflow({
        projectId,
        name,
        definition,
        status: 'PENDING',
        results: {},
      });
      res.status(201).json({ data: workflow });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create workflow', detail: String(err) });
    }
  });

  // GET /workflows/:id
  router.get('/workflows/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const workflow = await db.getWorkflow(param(req, 'id'));
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      res.json({ data: workflow });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get workflow', detail: String(err) });
    }
  });

  // PUT /workflows/:id
  router.put('/workflows/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const existing = await db.getWorkflow(param(req, 'id'));
      if (!existing) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      const updated = await db.updateWorkflow(param(req, 'id'), req.body);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update workflow', detail: String(err) });
    }
  });

  // POST /workflows/:id/start
  router.post('/workflows/:id/start', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');
      const orchestrator = req.app.locals.orchestrator as
        | { startWorkflow: (projectId: string, def: unknown) => Promise<unknown>; processNextTasks: (projectId: string) => Promise<unknown> }
        | undefined;

      const workflow = await db.getWorkflow(id);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      if (workflow.status !== 'PENDING') {
        res.status(400).json({
          error: `Cannot start workflow in ${workflow.status} status. Only PENDING workflows can be started.`,
        });
        return;
      }

      // If orchestrator is available, use it for full execution
      if (orchestrator) {
        const result = await orchestrator.startWorkflow(workflow.projectId, workflow.definition);
        // Kick off async task processing
        setImmediate(() => {
          orchestrator.processNextTasks(workflow.projectId).catch(() => {});
        });
        res.json({ data: result });
        return;
      }

      // Fallback: DB-only status update (no orchestrator)
      const previousStatus = workflow.status;
      const firstStageId = workflow.definition.stages[0]?.id;

      const updated = await db.updateWorkflow(id, {
        status: 'RUNNING',
        currentStageId: firstStageId,
        updatedAt: new Date().toISOString(),
      });

      if (wss) {
        const event: SystemEvent<WorkflowStatusPayload> = {
          type: EventType.WORKFLOW_STATUS_CHANGED,
          timestamp: new Date().toISOString(),
          payload: {
            workflowId: updated.id,
            previousStatus,
            newStatus: updated.status,
            stageId: firstStageId,
          },
        };
        wss.broadcastToProject(updated.projectId, event);
      }

      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to start workflow', detail: String(err) });
    }
  });

  return router;
}
