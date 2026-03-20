import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';
import {
  TaskStateMachine,
  EventType,
  type TaskStatus,
  type SystemEvent,
  type TaskStatusPayload,
} from '@mct-madev/core';

const taskSM = new TaskStateMachine();

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

function queryStr(req: Request, name: string): string | undefined {
  const v = req.query[name];
  if (typeof v === 'string') return v;
  return undefined;
}

export function createTasksRouter(): Router {
  const router = Router();

  // GET /projects/:projectId/tasks
  router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const filters: { status?: TaskStatus; assigneeAgentId?: string; workflowId?: string } = {};
      const status = queryStr(req, 'status');
      const assigneeAgentId = queryStr(req, 'assigneeAgentId');
      const workflowId = queryStr(req, 'workflowId');
      if (status) filters.status = status as TaskStatus;
      if (assigneeAgentId) filters.assigneeAgentId = assigneeAgentId;
      if (workflowId) filters.workflowId = workflowId;

      const tasks = await db.listTasks(param(req, 'projectId'), filters);
      res.json({ data: tasks, total: tasks.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list tasks', detail: String(err) });
    }
  });

  // POST /projects/:projectId/tasks
  router.post('/projects/:projectId/tasks', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const {
        title,
        description,
        workflowId,
        parentTaskId,
        assigneeAgentId,
        priority,
        dependencies,
        metadata,
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'title is required and must be a string' });
        return;
      }
      if (!description || typeof description !== 'string') {
        res.status(400).json({ error: 'description is required and must be a string' });
        return;
      }

      const projectId = param(req, 'projectId');
      const task = await db.createTask({
        projectId,
        title,
        description,
        status: 'CREATED' as TaskStatus,
        workflowId,
        parentTaskId,
        assigneeAgentId,
        priority: priority ?? 5,
        dependencies: dependencies ?? [],
        metadata: metadata ?? {},
      });
      res.status(201).json({ data: task });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create task', detail: String(err) });
    }
  });

  // GET /tasks/:id
  router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const task = await db.getTask(param(req, 'id'));
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      res.json({ data: task });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get task', detail: String(err) });
    }
  });

  // PUT /tasks/:id
  router.put('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const existing = await db.getTask(param(req, 'id'));
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      const updated = await db.updateTask(param(req, 'id'), req.body);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update task', detail: String(err) });
    }
  });

  // PUT /tasks/:id/transition
  router.put('/tasks/:id/transition', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const { status } = req.body;
      const id = param(req, 'id');

      if (!status || typeof status !== 'string') {
        res.status(400).json({ error: 'status is required and must be a string' });
        return;
      }

      const task = await db.getTask(id);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Validate transition using state machine
      if (!taskSM.canTransition(task.status, status as TaskStatus)) {
        res.status(400).json({
          error: `Invalid transition from ${task.status} to ${status}`,
          allowedTransitions: taskSM.getAvailableTransitions(task.status),
        });
        return;
      }

      const previousStatus = task.status;
      const updated = await db.updateTask(id, {
        status: status as TaskStatus,
        updatedAt: new Date().toISOString(),
      });

      // Broadcast task status change
      if (wss) {
        const event: SystemEvent<TaskStatusPayload> = {
          type: EventType.TASK_STATUS_CHANGED,
          timestamp: new Date().toISOString(),
          payload: {
            taskId: updated.id,
            previousStatus,
            newStatus: updated.status,
            agentId: updated.assigneeAgentId,
          },
        };
        wss.broadcastToProject(updated.projectId, event);
      }

      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to transition task', detail: String(err) });
    }
  });

  return router;
}
