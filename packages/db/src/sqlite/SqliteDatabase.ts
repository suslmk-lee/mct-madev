import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { Agent, Project, Task, Workflow } from '@mct-madev/core';
import type { IDatabase } from '../types.js';
import type {
  LogEntry,
  LogInput,
  Message,
  MessageInput,
  TaskFilter,
  TokenUsageInput,
  TokenUsageSummary,
} from '../models.js';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  repo_path TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  visual_state TEXT NOT NULL DEFAULT 'IDLE',
  position TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
  current_task_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  current_stage_id TEXT,
  results TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id TEXT REFERENCES workflows(id),
  parent_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'CREATED',
  assignee_agent_id TEXT REFERENCES agents(id),
  priority INTEGER NOT NULL DEFAULT 0,
  dependencies TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow ON tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_project ON token_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_project ON logs(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
`;

// ── Row types ─────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  repo_path: string | null;
  config: string;
  created_at: string;
  updated_at: string;
}

interface AgentRow {
  id: string;
  project_id: string;
  name: string;
  role: string;
  provider: string;
  model: string;
  system_prompt: string | null;
  visual_state: string;
  position: string;
  current_task_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  project_id: string;
  workflow_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  status: string;
  assignee_agent_id: string | null;
  priority: number;
  dependencies: string;
  metadata: string;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowRow {
  id: string;
  project_id: string;
  name: string;
  definition: string;
  status: string;
  current_stage_id: string | null;
  results: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  task_id: string;
  agent_id: string;
  role: string;
  content: string;
  token_count: number | null;
  created_at: string;
}

interface LogRow {
  id: string;
  project_id: string;
  level: string;
  source: string;
  message: string;
  metadata: string | null;
  created_at: string;
}

interface TokenUsageRow {
  project_id: string;
  agent_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function stmtToRows<T>(db: SqlJsDatabase, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as (string | number | null | Uint8Array)[]);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function stmtGetOne<T>(db: SqlJsDatabase, sql: string, params: unknown[] = []): T | undefined {
  const rows = stmtToRows<T>(db, sql, params);
  return rows[0];
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    repoPath: row.repo_path ?? undefined,
    config: JSON.parse(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    role: row.role as Agent['role'],
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt ?? undefined,
    visualState: row.visual_state as Agent['visualState'],
    position: JSON.parse(row.position),
    currentTaskId: row.current_task_id ?? undefined,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    workflowId: row.workflow_id ?? undefined,
    parentTaskId: row.parent_task_id ?? undefined,
    title: row.title,
    description: row.description,
    status: row.status as Task['status'],
    assigneeAgentId: row.assignee_agent_id ?? undefined,
    priority: row.priority,
    dependencies: JSON.parse(row.dependencies),
    metadata: JSON.parse(row.metadata),
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    definition: JSON.parse(row.definition),
    status: row.status as Workflow['status'],
    currentStageId: row.current_stage_id ?? undefined,
    results: JSON.parse(row.results),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    role: row.role as Message['role'],
    content: row.content,
    tokenCount: row.token_count ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToLog(row: LogRow): LogEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    level: row.level as LogEntry['level'],
    source: row.source,
    message: row.message,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
  };
}

function now(): string {
  return new Date().toISOString();
}

// ── SqliteDatabase ──────────────────────────────────────────────────

export class SqliteDatabase implements IDatabase {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private persistToDisk: boolean;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.persistToDisk = dbPath !== ':memory:';
  }

  async initialize(): Promise<void> {
    const SQL = await initSqlJs();

    if (this.persistToDisk) {
      try {
        const buffer = readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } catch {
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run(INIT_SQL);
  }

  private save(): void {
    if (this.persistToDisk) {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    }
  }

  async close(): Promise<void> {
    this.save();
    this.db.close();
  }

  // ── Projects ────────────────────────────────────────────────────────

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO projects (id, name, description, repo_path, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, project.name, project.description ?? null, project.repoPath ?? null, JSON.stringify(project.config), ts, ts],
    );
    this.save();
    return (await this.getProject(id))!;
  }

  async getProject(id: string): Promise<Project | null> {
    const row = stmtGetOne<ProjectRow>(this.db, 'SELECT * FROM projects WHERE id = ?', [id]);
    return row ? rowToProject(row) : null;
  }

  async listProjects(): Promise<Project[]> {
    return stmtToRows<ProjectRow>(this.db, 'SELECT * FROM projects ORDER BY created_at DESC').map(rowToProject);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const existing = await this.getProject(id);
    if (!existing) throw new Error(`Project not found: ${id}`);

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [ts];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.repoPath !== undefined) { sets.push('repo_path = ?'); values.push(updates.repoPath); }
    if (updates.config !== undefined) { sets.push('config = ?'); values.push(JSON.stringify(updates.config)); }

    values.push(id);
    this.db.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, values as (string | number | null)[]);
    this.save();
    return (await this.getProject(id))!;
  }

  async deleteProject(id: string): Promise<void> {
    this.db.run('DELETE FROM projects WHERE id = ?', [id]);
    this.save();
  }

  // ── Agents ──────────────────────────────────────────────────────────

  async createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO agents (id, project_id, name, role, provider, model, system_prompt, visual_state, position, current_task_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, agent.projectId, agent.name, agent.role, agent.provider, agent.model, agent.systemPrompt ?? null, agent.visualState, JSON.stringify(agent.position), agent.currentTaskId ?? null, JSON.stringify(agent.metadata), ts, ts],
    );
    this.save();
    return (await this.getAgent(id))!;
  }

  async getAgent(id: string): Promise<Agent | null> {
    const row = stmtGetOne<AgentRow>(this.db, 'SELECT * FROM agents WHERE id = ?', [id]);
    return row ? rowToAgent(row) : null;
  }

  async listAgents(projectId: string): Promise<Agent[]> {
    return stmtToRows<AgentRow>(this.db, 'SELECT * FROM agents WHERE project_id = ? ORDER BY created_at', [projectId]).map(rowToAgent);
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
    const existing = await this.getAgent(id);
    if (!existing) throw new Error(`Agent not found: ${id}`);

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [ts];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.role !== undefined) { sets.push('role = ?'); values.push(updates.role); }
    if (updates.provider !== undefined) { sets.push('provider = ?'); values.push(updates.provider); }
    if (updates.model !== undefined) { sets.push('model = ?'); values.push(updates.model); }
    if (updates.systemPrompt !== undefined) { sets.push('system_prompt = ?'); values.push(updates.systemPrompt); }
    if (updates.visualState !== undefined) { sets.push('visual_state = ?'); values.push(updates.visualState); }
    if (updates.position !== undefined) { sets.push('position = ?'); values.push(JSON.stringify(updates.position)); }
    if (updates.currentTaskId !== undefined) { sets.push('current_task_id = ?'); values.push(updates.currentTaskId); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

    values.push(id);
    this.db.run(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`, values as (string | number | null)[]);
    this.save();
    return (await this.getAgent(id))!;
  }

  async deleteAgent(id: string): Promise<void> {
    // Clear FK references before deleting the agent
    this.db.run('DELETE FROM token_usage WHERE agent_id = ?', [id]);
    this.db.run('DELETE FROM messages WHERE agent_id = ?', [id]);
    this.db.run('UPDATE tasks SET assignee_agent_id = NULL WHERE assignee_agent_id = ?', [id]);
    this.db.run('DELETE FROM agents WHERE id = ?', [id]);
    this.save();
  }

  // ── Tasks ───────────────────────────────────────────────────────────

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO tasks (id, project_id, workflow_id, parent_task_id, title, description, status, assignee_agent_id, priority, dependencies, metadata, result, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, task.projectId, task.workflowId ?? null, task.parentTaskId ?? null, task.title, task.description, task.status, task.assigneeAgentId ?? null, task.priority, JSON.stringify(task.dependencies), JSON.stringify(task.metadata), task.result ?? null, task.error ?? null, ts, ts],
    );
    this.save();
    return (await this.getTask(id))!;
  }

  async getTask(id: string): Promise<Task | null> {
    const row = stmtGetOne<TaskRow>(this.db, 'SELECT * FROM tasks WHERE id = ?', [id]);
    return row ? rowToTask(row) : null;
  }

  async listTasks(projectId: string, filters?: TaskFilter): Promise<Task[]> {
    const conditions: string[] = ['project_id = ?'];
    const values: unknown[] = [projectId];

    if (filters?.status) { conditions.push('status = ?'); values.push(filters.status); }
    if (filters?.assigneeAgentId) { conditions.push('assignee_agent_id = ?'); values.push(filters.assigneeAgentId); }
    if (filters?.workflowId) { conditions.push('workflow_id = ?'); values.push(filters.workflowId); }

    const sql = `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY priority DESC, created_at`;
    return stmtToRows<TaskRow>(this.db, sql, values).map(rowToTask);
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const existing = await this.getTask(id);
    if (!existing) throw new Error(`Task not found: ${id}`);

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [ts];

    if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.assigneeAgentId !== undefined) { sets.push('assignee_agent_id = ?'); values.push(updates.assigneeAgentId); }
    if (updates.priority !== undefined) { sets.push('priority = ?'); values.push(updates.priority); }
    if (updates.dependencies !== undefined) { sets.push('dependencies = ?'); values.push(JSON.stringify(updates.dependencies)); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }
    if (updates.result !== undefined) { sets.push('result = ?'); values.push(updates.result); }
    if (updates.error !== undefined) { sets.push('error = ?'); values.push(updates.error); }
    if (updates.workflowId !== undefined) { sets.push('workflow_id = ?'); values.push(updates.workflowId); }
    if (updates.parentTaskId !== undefined) { sets.push('parent_task_id = ?'); values.push(updates.parentTaskId); }

    values.push(id);
    this.db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values as (string | number | null)[]);
    this.save();
    return (await this.getTask(id))!;
  }

  // ── Workflows ─────────────────────────────────────────────────────

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO workflows (id, project_id, name, definition, status, current_stage_id, results, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workflow.projectId, workflow.name, JSON.stringify(workflow.definition), workflow.status, workflow.currentStageId ?? null, JSON.stringify(workflow.results), ts, ts],
    );
    this.save();
    return (await this.getWorkflow(id))!;
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const row = stmtGetOne<WorkflowRow>(this.db, 'SELECT * FROM workflows WHERE id = ?', [id]);
    return row ? rowToWorkflow(row) : null;
  }

  async listWorkflows(projectId: string): Promise<Workflow[]> {
    return stmtToRows<WorkflowRow>(this.db, 'SELECT * FROM workflows WHERE project_id = ? ORDER BY created_at DESC', [projectId]).map(rowToWorkflow);
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    const existing = await this.getWorkflow(id);
    if (!existing) throw new Error(`Workflow not found: ${id}`);

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [ts];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.definition !== undefined) { sets.push('definition = ?'); values.push(JSON.stringify(updates.definition)); }
    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.currentStageId !== undefined) { sets.push('current_stage_id = ?'); values.push(updates.currentStageId); }
    if (updates.results !== undefined) { sets.push('results = ?'); values.push(JSON.stringify(updates.results)); }

    values.push(id);
    this.db.run(`UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`, values as (string | number | null)[]);
    this.save();
    return (await this.getWorkflow(id))!;
  }

  // ── Messages ──────────────────────────────────────────────────────

  async createMessage(msg: MessageInput): Promise<Message> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO messages (id, task_id, agent_id, role, content, token_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, msg.taskId, msg.agentId, msg.role, msg.content, msg.tokenCount ?? null, ts],
    );
    this.save();
    const row = stmtGetOne<MessageRow>(this.db, 'SELECT * FROM messages WHERE id = ?', [id])!;
    return rowToMessage(row);
  }

  async listMessages(taskId: string): Promise<Message[]> {
    return stmtToRows<MessageRow>(this.db, 'SELECT * FROM messages WHERE task_id = ? ORDER BY created_at', [taskId]).map(rowToMessage);
  }

  // ── Logs ──────────────────────────────────────────────────────────

  async createLog(log: LogInput): Promise<void> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO logs (id, project_id, level, source, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, log.projectId, log.level, log.source, log.message, log.metadata ? JSON.stringify(log.metadata) : null, ts],
    );
    this.save();
  }

  async listLogs(projectId: string, limit: number = 100): Promise<LogEntry[]> {
    return stmtToRows<LogRow>(this.db, 'SELECT * FROM logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?', [projectId, limit]).map(rowToLog);
  }

  // ── Token Usage ───────────────────────────────────────────────────

  async recordTokenUsage(usage: TokenUsageInput): Promise<void> {
    const id = crypto.randomUUID();
    const ts = now();
    this.db.run(
      `INSERT INTO token_usage (id, project_id, agent_id, provider, model, input_tokens, output_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, usage.projectId, usage.agentId, usage.provider, usage.model, usage.inputTokens, usage.outputTokens, ts],
    );
    this.save();
  }

  async getTokenUsage(projectId: string): Promise<TokenUsageSummary> {
    const rows = stmtToRows<TokenUsageRow>(
      this.db,
      'SELECT agent_id, provider, model, input_tokens, output_tokens FROM token_usage WHERE project_id = ?',
      [projectId],
    );

    const summary: TokenUsageSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byProvider: {},
      byAgent: {},
    };

    for (const row of rows) {
      summary.totalInputTokens += row.input_tokens;
      summary.totalOutputTokens += row.output_tokens;

      if (!summary.byProvider[row.provider]) {
        summary.byProvider[row.provider] = { input: 0, output: 0 };
      }
      summary.byProvider[row.provider].input += row.input_tokens;
      summary.byProvider[row.provider].output += row.output_tokens;

      if (!summary.byAgent[row.agent_id]) {
        summary.byAgent[row.agent_id] = { input: 0, output: 0 };
      }
      summary.byAgent[row.agent_id].input += row.input_tokens;
      summary.byAgent[row.agent_id].output += row.output_tokens;
    }

    return summary;
  }
}
