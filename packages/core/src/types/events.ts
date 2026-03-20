export const EventType = {
  AGENT_STATE_CHANGED: 'AGENT_STATE_CHANGED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  WORKFLOW_STATUS_CHANGED: 'WORKFLOW_STATUS_CHANGED',
  PM_REPORT_READY: 'PM_REPORT_READY',
  MESSAGE_CREATED: 'MESSAGE_CREATED',
  TOKEN_USAGE_UPDATED: 'TOKEN_USAGE_UPDATED',
  LOG_ENTRY: 'LOG_ENTRY',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export interface SystemEvent<T = unknown> {
  type: EventType;
  timestamp: string;
  payload: T;
}

export interface AgentStatePayload {
  agentId: string;
  previousState: string;
  newState: string;
  position?: { x: number; y: number; z: number };
}

export interface TaskStatusPayload {
  taskId: string;
  previousStatus: string;
  newStatus: string;
  agentId?: string;
}

export interface WorkflowStatusPayload {
  workflowId: string;
  previousStatus: string;
  newStatus: string;
  stageId?: string;
}
