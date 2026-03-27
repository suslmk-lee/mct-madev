import { Router, type Request, type Response } from 'express';
import { sendError } from '../routeError.js';
import { isValidPriority, TASK_PRIORITY_MIN, TASK_PRIORITY_MAX } from '../validation.js';
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
      const VALID_TASK_STATUSES: TaskStatus[] = [
        'CREATED', 'PLANNING', 'REVIEWING', 'APPROVED', 'IN_PROGRESS',
        'CODE_REVIEW', 'MERGING', 'DONE', 'REJECTED', 'BLOCKED', 'FAILED',
      ];
      if (status) {
        if (!VALID_TASK_STATUSES.includes(status as TaskStatus)) {
          res.status(400).json({ error: 'Invalid status filter' });
          return;
        }
        filters.status = status as TaskStatus;
      }
      if (assigneeAgentId) filters.assigneeAgentId = assigneeAgentId;
      if (workflowId) filters.workflowId = workflowId;

      const limit = Math.min(Math.max(1, parseInt(queryStr(req, 'limit') ?? '500', 10) || 500), 500);
      const offset = Math.max(0, parseInt(queryStr(req, 'offset') ?? '0', 10) || 0);
      const projectId = param(req, 'projectId');
      const [tasks, total] = await Promise.all([
        db.listTasks(projectId, filters, { limit, offset }),
        db.countTasks(projectId, filters),
      ]);
      res.json({ data: tasks, total, limit, offset });
    } catch (err) {
      sendError(res, 500, 'Failed to list tasks', err);
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
      if (priority !== undefined && !isValidPriority(priority)) {
        res.status(400).json({ error: `priority must be an integer between ${TASK_PRIORITY_MIN} and ${TASK_PRIORITY_MAX}` });
        return;
      }

      if (workflowId) {
        if ((db as unknown as { getWorkflow?: (id: string) => Promise<unknown> }).getWorkflow) {
          const workflow = await (db as unknown as { getWorkflow: (id: string) => Promise<unknown> }).getWorkflow(workflowId);
          if (!workflow) {
            res.status(400).json({ error: 'Workflow not found' });
            return;
          }
        }
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
      sendError(res, 500, 'Failed to create task', err);
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
      sendError(res, 500, 'Failed to get task', err);
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
      sendError(res, 500, 'Failed to update task', err);
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
      sendError(res, 500, 'Failed to transition task', err);
    }
  });

  // POST /tasks/:id/cancel — cancel IN_PROGRESS or CREATED task
  router.post('/tasks/:id/cancel', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');

      const task = await db.getTask(id);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (!['IN_PROGRESS', 'CREATED'].includes(task.status)) {
        res.status(400).json({ error: 'Only IN_PROGRESS or CREATED tasks can be cancelled' });
        return;
      }

      const previousStatus = task.status;
      const updated = await db.updateTask(id, {
        status: 'FAILED' as TaskStatus,
        error: '사용자에 의해 취소됨',
        updatedAt: new Date().toISOString(),
      });

      // Cancel CREATED tasks that depend on this task (they can no longer proceed)
      const allTasks = await db.listTasks(updated.projectId);
      const dependents = allTasks.filter(
        (t) => t.id !== id &&
          t.status === 'CREATED' &&
          (t.dependencies ?? []).includes(task.title),
      );
      const cancelledDependents: string[] = [];
      for (const dep of dependents) {
        const depUpdated = await db.updateTask(dep.id, {
          status: 'FAILED' as TaskStatus,
          error: `의존 태스크 "${task.title}"가 취소됨`,
          updatedAt: new Date().toISOString(),
        });
        cancelledDependents.push(dep.title);
        if (wss) {
          wss.broadcastToProject(depUpdated.projectId, {
            type: 'task:update' as never,
            timestamp: new Date().toISOString(),
            payload: { id: dep.id, status: 'FAILED', error: `의존 태스크 "${task.title}"가 취소됨` },
          });
        }
      }

      if (wss) {
        const event: SystemEvent<TaskStatusPayload> = {
          type: EventType.TASK_STATUS_CHANGED,
          timestamp: new Date().toISOString(),
          payload: {
            taskId: updated.id,
            previousStatus,
            newStatus: 'FAILED',
            agentId: updated.assigneeAgentId,
          },
        };
        wss.broadcastToProject(updated.projectId, event);
      }

      res.json({ data: updated, cancelledDependents });
    } catch (err) {
      sendError(res, 500, 'Failed to cancel task', err);
    }
  });

  // POST /tasks/:id/retry — reset FAILED task back to CREATED
  router.post('/tasks/:id/retry', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const id = param(req, 'id');

      const task = await db.getTask(id);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (!['FAILED', 'BLOCKED'].includes(task.status)) {
        res.status(400).json({ error: 'Only FAILED or BLOCKED tasks can be retried' });
        return;
      }

      const updated = await db.updateTask(id, {
        status: 'CREATED' as TaskStatus,
        error: undefined,
        updatedAt: new Date().toISOString(),
      });

      if (wss) {
        const event: SystemEvent<TaskStatusPayload> = {
          type: EventType.TASK_STATUS_CHANGED,
          timestamp: new Date().toISOString(),
          payload: {
            taskId: updated.id,
            previousStatus: 'FAILED',
            newStatus: 'CREATED',
            agentId: updated.assigneeAgentId,
          },
        };
        wss.broadcastToProject(updated.projectId, event);
      }

      res.json({ data: updated });
    } catch (err) {
      sendError(res, 500, 'Failed to retry task', err);
    }
  });

  return router;
}
