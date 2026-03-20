import type { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { SystemEvent, AgentStatePayload, TaskStatusPayload, WorkflowStatusPayload } from '@mct-madev/core';
import { EventType } from '@mct-madev/core';
import type { ServerDatabase } from './database.js';
import type { WebSocketManager } from './websocket/index.js';

/**
 * Bridges Orchestrator events (via EventEmitter) to WebSocket clients.
 * Translates internal event types to client-friendly message types.
 */
export function createEventBridge(
  emitter: EventEmitter,
  wss: WebSocketManager,
  db: ServerDatabase,
): void {
  emitter.on(EventType.AGENT_STATE_CHANGED, async (event: SystemEvent<AgentStatePayload>) => {
    try {
      const agent = await db.getAgent(event.payload.agentId);
      if (!agent) return;

      // Broadcast as client-friendly format
      wss.broadcastToProject(agent.projectId, {
        type: 'agent:update' as unknown as EventType,
        timestamp: event.timestamp,
        payload: agent,
      });
    } catch {
      // Ignore broadcast errors
    }
  });

  emitter.on(EventType.TASK_STATUS_CHANGED, async (event: SystemEvent<TaskStatusPayload>) => {
    try {
      const task = await db.getTask(event.payload.taskId);
      if (!task) return;

      wss.broadcastToProject(task.projectId, {
        type: 'task:update' as unknown as EventType,
        timestamp: event.timestamp,
        payload: task,
      });
    } catch {
      // Ignore broadcast errors
    }
  });

  emitter.on(EventType.WORKFLOW_STATUS_CHANGED, async (event: SystemEvent<WorkflowStatusPayload>) => {
    try {
      const workflow = await db.getWorkflow(event.payload.workflowId);
      if (!workflow) return;

      wss.broadcastToProject(workflow.projectId, {
        type: 'workflow:update' as unknown as EventType,
        timestamp: event.timestamp,
        payload: workflow,
      });
    } catch {
      // Ignore broadcast errors
    }
  });
}

/**
 * Sets up initial data sync when a client subscribes to a project.
 */
export function setupSubscribeSync(
  wss: WebSocketManager,
  db: ServerDatabase,
): void {
  wss.on('message', async (message: { type: string; projectId?: string }, ws: WebSocket) => {
    if (message.type === 'subscribe' && message.projectId) {
      try {
        const agents = await db.listAgents(message.projectId);
        const tasks = await db.listTasks(message.projectId);

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'agents:sync', payload: agents }));
          ws.send(JSON.stringify({ type: 'tasks:sync', payload: tasks }));
        }
      } catch {
        // Ignore sync errors
      }
    }
  });
}
