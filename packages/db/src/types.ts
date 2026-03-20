import type { Agent, Project, Task, Workflow } from '@mct-madev/core';
import type {
  LogEntry,
  LogInput,
  Message,
  MessageInput,
  TaskFilter,
  TokenUsageInput,
  TokenUsageSummary,
} from './models.js';

export interface IDatabase {
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Projects
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Agents
  createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent>;
  getAgent(id: string): Promise<Agent | null>;
  listAgents(projectId: string): Promise<Agent[]>;
  updateAgent(id: string, updates: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;

  // Tasks
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  listTasks(projectId: string, filters?: TaskFilter): Promise<Task[]>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;

  // Workflows
  createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  getWorkflow(id: string): Promise<Workflow | null>;
  listWorkflows(projectId: string): Promise<Workflow[]>;
  updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow>;

  // Messages & Logs
  createMessage(msg: MessageInput): Promise<Message>;
  listMessages(taskId: string): Promise<Message[]>;
  createLog(log: LogInput): Promise<void>;
  listLogs(projectId: string, limit?: number): Promise<LogEntry[]>;

  // Token usage
  recordTokenUsage(usage: TokenUsageInput): Promise<void>;
  getTokenUsage(projectId: string): Promise<TokenUsageSummary>;
}
