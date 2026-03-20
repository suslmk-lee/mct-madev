export const TaskStatus = {
  CREATED: 'CREATED',
  PLANNING: 'PLANNING',
  REVIEWING: 'REVIEWING',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  CODE_REVIEW: 'CODE_REVIEW',
  MERGING: 'MERGING',
  DONE: 'DONE',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  CREATED: ['PLANNING', 'REJECTED'],
  PLANNING: ['REVIEWING', 'FAILED'],
  REVIEWING: ['APPROVED', 'REJECTED', 'PLANNING'],
  APPROVED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['CODE_REVIEW', 'FAILED', 'BLOCKED'],
  CODE_REVIEW: ['MERGING', 'IN_PROGRESS', 'REJECTED'],
  MERGING: ['DONE', 'FAILED'],
  DONE: [],
  REJECTED: ['PLANNING'],
  BLOCKED: ['IN_PROGRESS', 'APPROVED'],
  FAILED: ['PLANNING', 'CREATED'],
};

export interface Task {
  id: string;
  projectId: string;
  workflowId?: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeAgentId?: string;
  priority: number;
  dependencies: string[];
  metadata: Record<string, unknown>;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class TaskStateMachine {
  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    return TASK_TRANSITIONS[from]?.includes(to) ?? false;
  }

  transition(task: Task, to: TaskStatus): Task {
    if (!this.canTransition(task.status, to)) {
      throw new Error(`Invalid transition: ${task.status} → ${to}`);
    }
    return { ...task, status: to, updatedAt: new Date().toISOString() };
  }

  getAvailableTransitions(status: TaskStatus): TaskStatus[] {
    return TASK_TRANSITIONS[status] ?? [];
  }
}
