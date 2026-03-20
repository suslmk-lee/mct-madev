import type { Agent, Project, Task, TaskStatus, Workflow } from '@mct-madev/core';

/**
 * Database interface aligned with @mct-madev/db IDatabase.
 * Any IDatabase implementation can be used directly as ServerDatabase.
 */
export interface ServerDatabase {
  initialize?(): Promise<void>;
  close?(): Promise<void>;

  // Projects
  createProject(data: {
    name: string;
    description?: string;
    repoPath?: string;
    config: Project['config'];
  }): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  updateProject(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Agents
  createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent>;
  getAgent(id: string): Promise<Agent | null>;
  listAgents(projectId: string): Promise<Agent[]>;
  updateAgent(id: string, data: Partial<Omit<Agent, 'id' | 'projectId' | 'createdAt'>>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;

  // Tasks
  createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  listTasks(projectId: string, filters?: {
    status?: TaskStatus;
    assigneeAgentId?: string;
    workflowId?: string;
  }): Promise<Task[]>;
  updateTask(id: string, data: Partial<Omit<Task, 'id' | 'projectId' | 'createdAt'>>): Promise<Task>;

  // Workflows
  createWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  getWorkflow(id: string): Promise<Workflow | null>;
  listWorkflows(projectId: string): Promise<Workflow[]>;
  updateWorkflow(id: string, data: Partial<Omit<Workflow, 'id' | 'projectId' | 'createdAt'>>): Promise<Workflow>;

  // Metrics (optional)
  getTokenUsage?(projectId: string): Promise<{
    totalInputTokens: number;
    totalOutputTokens: number;
    byProvider: Record<string, { input: number; output: number }>;
    byAgent: Record<string, { input: number; output: number }>;
  }>;
}
