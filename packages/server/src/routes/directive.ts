import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';
import type { Agent, Task } from '@mct-madev/core';
import type { WebSocketManager } from '../websocket/index.js';
import {
  PMAgent,
  TaskStatus,
  AgentVisualState,
  EventType,
  SkillLoader,
  type GatewayChatFn,
  type SkillDefinition,
  type ExtendedChatResponse,
  type ToolUseBlock,
} from '@mct-madev/core';

function getDb(req: Request): ServerDatabase {
  return req.app.locals.db as ServerDatabase;
}

function getWss(req: Request): WebSocketManager | undefined {
  return req.app.locals.wss as WebSocketManager | undefined;
}

function getSkillLoader(req: Request): SkillLoader | undefined {
  return req.app.locals.skillLoader as SkillLoader | undefined;
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

// ── WS broadcast (UI-compatible format, same as bridge.ts) ────────

function broadcastAgentUpdate(wss: WebSocketManager | undefined, projectId: string, agent: Agent): void {
  if (!wss) return;
  wss.broadcastToProject(projectId, {
    type: 'agent:update' as unknown as typeof EventType[keyof typeof EventType],
    timestamp: new Date().toISOString(),
    payload: agent,
  });
}

function broadcastTaskUpdate(wss: WebSocketManager | undefined, projectId: string, task: Task): void {
  if (!wss) return;
  wss.broadcastToProject(projectId, {
    type: 'task:update' as unknown as typeof EventType[keyof typeof EventType],
    timestamp: new Date().toISOString(),
    payload: task,
  });
}

// ── Helper: update agent state and broadcast ──────────────────────

async function setAgentWorking(db: ServerDatabase, wss: WebSocketManager | undefined, projectId: string, agentId: string): Promise<void> {
  const updated = await db.updateAgent(agentId, { visualState: AgentVisualState.WORKING });
  broadcastAgentUpdate(wss, projectId, updated);
}

async function setAgentIdle(db: ServerDatabase, wss: WebSocketManager | undefined, projectId: string, agentId: string): Promise<void> {
  const updated = await db.updateAgent(agentId, { visualState: AgentVisualState.IDLE });
  broadcastAgentUpdate(wss, projectId, updated);
}

// ── Router ────────────────────────────────────────────────────────

export function createDirectiveRouter(): Router {
  const router = Router();

  // POST /projects/:projectId/directive
  router.post('/projects/:projectId/directive', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const projectId = param(req, 'projectId');
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      const agents = await db.listAgents(projectId);
      const pmAgent = agents.find((a) => a.role === 'PM');
      if (!pmAgent) {
        res.status(400).json({ error: 'No PM agent found in this project. Add a PM agent first.' });
        return;
      }

      const chatFn = req.app.locals.chatFn as GatewayChatFn | undefined;
      if (!chatFn) {
        res.status(500).json({ error: 'Chat function not available. Check AI provider configuration.' });
        return;
      }

      // PM starts working
      await setAgentWorking(db, wss, projectId, pmAgent.id);

      // Create root directive task
      const rootTask = await db.createTask({
        projectId,
        title: message.slice(0, 100),
        description: message,
        status: TaskStatus.CREATED,
        assigneeAgentId: pmAgent.id,
        priority: 10,
        dependencies: [],
        metadata: { type: 'directive' },
      });

      // PM decomposes directive into subtasks
      const pm = new PMAgent();
      const pmChatFn = async (msgs: { role: string; content: string }[]) => {
        const result = await chatFn(pmAgent.provider, pmAgent.model, msgs as never, pmAgent.systemPrompt);
        return result as import('@mct-madev/core').ChatResponse;
      };

      let subtaskDefs;
      try {
        subtaskDefs = await pm.decompose(
          rootTask as never,
          pmChatFn,
          agents.map((a) => ({ name: a.name, role: a.role, id: a.id })),
        );
      } catch (err) {
        const updated = await db.updateTask(rootTask.id, { status: TaskStatus.DONE, result: `PM could not decompose: ${err}` });
        broadcastTaskUpdate(wss, projectId, updated);
        await setAgentIdle(db, wss, projectId, pmAgent.id);
        res.json({ data: { rootTask: updated, subtasks: [], error: String(err) } });
        return;
      }

      // PM done planning
      await setAgentIdle(db, wss, projectId, pmAgent.id);

      const updatedRoot = await db.updateTask(rootTask.id, {
        status: TaskStatus.DONE,
        result: JSON.stringify(subtaskDefs),
      });
      broadcastTaskUpdate(wss, projectId, updatedRoot);

      // Batch-assign subtasks across agents evenly
      const assignments = assignSubtasks(agents, subtaskDefs);
      const createdSubtasks = [];
      for (let i = 0; i < subtaskDefs.length; i++) {
        const sub = subtaskDefs[i];
        const assignee = assignments.get(i) ?? matchAgent(agents, sub);
        const subtask = await db.createTask({
          projectId,
          parentTaskId: rootTask.id,
          title: sub.title,
          description: sub.description,
          status: TaskStatus.CREATED,
          assigneeAgentId: assignee?.id,
          priority: sub.priority,
          dependencies: [],
          metadata: { ...sub.metadata, parentDirective: rootTask.id },
        });
        broadcastTaskUpdate(wss, projectId, subtask);
        createdSubtasks.push({ ...subtask, assigneeName: assignee?.name });
      }

      // Execute subtasks asynchronously (with skills if available)
      const skillLoader = getSkillLoader(req);
      executeSubtasks(db, wss, projectId, chatFn, agents, createdSubtasks, skillLoader).catch(() => {});

      res.json({
        data: {
          rootTask: updatedRoot,
          subtasks: createdSubtasks,
          message: `PM decomposed into ${createdSubtasks.length} subtasks. Execution started.`,
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to process directive', detail: String(err) });
    }
  });

  // GET /projects/:projectId/tasks/status
  router.get('/projects/:projectId/tasks/status', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const projectId = param(req, 'projectId');
      const tasks = await db.listTasks(projectId);
      const agents = await db.listAgents(projectId);

      const agentMap = new Map(agents.map((a) => [a.id, a.name]));
      const summary = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee: t.assigneeAgentId ? agentMap.get(t.assigneeAgentId) ?? t.assigneeAgentId : undefined,
        result: t.result ? t.result.slice(0, 200) : undefined,
        error: t.error,
      }));

      const done = tasks.filter((t) => t.status === 'DONE').length;
      const failed = tasks.filter((t) => t.status === 'FAILED').length;
      const inProgress = tasks.filter((t) => !['DONE', 'FAILED', 'CREATED'].includes(t.status)).length;

      res.json({
        data: summary,
        stats: { total: tasks.length, done, failed, inProgress, pending: tasks.length - done - failed - inProgress },
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get task status', detail: String(err) });
    }
  });

  return router;
}

// ── Helpers ───────────────────────────────────────────────────────

const ROLE_KEYWORDS: Record<string, string[]> = {
  DEVELOPER: ['implement', 'code', 'develop', 'build', 'create', 'fix', 'bug', 'feature', 'refactor', 'frontend', 'backend', 'api', '개발', '구현', '코드', '프론트', '백엔드', '서버', '클라이언트', 'ui', 'page', 'component', 'design', 'html', 'css'],
  REVIEWER: ['review', 'check', 'inspect', 'audit', '리뷰', '검토'],
  TESTER: ['test', 'qa', 'quality', 'verify', 'validation', '테스트', '검증'],
  DEVOPS: ['deploy', 'ci', 'cd', 'infra', 'docker', 'kubernetes', 'pipeline', '배포', '인프라'],
  PM: ['plan', 'coordinate', 'manage', 'schedule', '기획', '관리'],
};

function detectBestRole(sub: { title: string; description: string }): string {
  const text = `${sub.title} ${sub.description}`.toLowerCase();
  let bestRole = 'DEVELOPER';
  let bestScore = 0;
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (role === 'PM') continue;
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestRole = role; }
  }
  return bestRole;
}

function assignSubtasks(
  agents: Agent[],
  subtaskDefs: Array<{ title: string; description: string; assignee?: string }>,
): Map<number, Agent> {
  const result = new Map<number, Agent>();
  const workers = agents.filter((a) => a.role !== 'PM');
  if (workers.length === 0) return result;

  const assignCount = new Map<string, number>();
  for (const a of workers) assignCount.set(a.id, 0);

  const agentsByRole = new Map<string, Agent[]>();
  for (const a of workers) {
    const list = agentsByRole.get(a.role) ?? [];
    list.push(a);
    agentsByRole.set(a.role, list);
  }

  for (let i = 0; i < subtaskDefs.length; i++) {
    const sub = subtaskDefs[i];
    const role = detectBestRole(sub);
    let candidates = agentsByRole.get(role);
    if (!candidates || candidates.length === 0) candidates = workers;

    candidates.sort((a, b) => (assignCount.get(a.id) ?? 0) - (assignCount.get(b.id) ?? 0));
    const picked = candidates[0];
    result.set(i, picked);
    assignCount.set(picked.id, (assignCount.get(picked.id) ?? 0) + 1);
  }
  return result;
}

function matchAgent(agents: Agent[], sub: { title: string; description: string }): Agent | undefined {
  const role = detectBestRole(sub);
  const candidates = agents.filter((a) => a.role === role && a.role !== 'PM');
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  const workers = agents.filter((a) => a.role !== 'PM');
  return workers.length > 0 ? workers[Math.floor(Math.random() * workers.length)] : undefined;
}

/** Execute a tool call (for now, returns a description of what would be done) */
function executeToolCall(toolUse: ToolUseBlock): string {
  // In the future, this can dispatch to actual handlers (scripts, APIs, etc.)
  return `[Tool "${toolUse.name}" executed with input: ${JSON.stringify(toolUse.input)}]`;
}

async function executeSubtasks(
  db: ServerDatabase,
  wss: WebSocketManager | undefined,
  projectId: string,
  chatFn: GatewayChatFn,
  agents: Agent[],
  subtasks: Array<{ id: string; assigneeAgentId?: string; title: string; description: string }>,
  skillLoader?: SkillLoader,
): Promise<void> {
  // Load available skills once
  const allSkills = skillLoader?.loadSkills() ?? [];

  for (const subtask of subtasks) {
    const agent = agents.find((a) => a.id === subtask.assigneeAgentId);
    if (!agent) continue;

    try {
      // Agent starts working
      await setAgentWorking(db, wss, projectId, agent.id);

      // Task → IN_PROGRESS
      const inProgress = await db.updateTask(subtask.id, { status: TaskStatus.IN_PROGRESS });
      broadcastTaskUpdate(wss, projectId, inProgress);

      // Select relevant skills for this agent + task
      const selectedSkills = skillLoader
        ? skillLoader.selectSkills(allSkills, agent.role, subtask.description)
        : [];

      // Call LLM (with tools if skills are available)
      const chatOptions = selectedSkills.length > 0
        ? { tools: selectedSkills, tool_choice: 'auto' as const }
        : undefined;

      let response = await chatFn(
        agent.provider,
        agent.model,
        [{ role: 'user', content: subtask.description }],
        agent.systemPrompt,
        chatOptions,
      );

      // Tool use loop: if LLM requests tool calls, execute and continue
      let iterations = 0;
      const MAX_TOOL_ITERATIONS = 5;
      const resultParts: string[] = [];

      while (iterations < MAX_TOOL_ITERATIONS) {
        const extResponse = response as ExtendedChatResponse;
        if (!extResponse.toolUse || extResponse.toolUse.length === 0) break;

        // Collect text content
        if (extResponse.content) resultParts.push(extResponse.content);

        // Execute each tool call
        const toolResults = extResponse.toolUse.map((tu) => ({
          role: 'user' as const,
          content: `Tool result for ${tu.name} (id: ${tu.id}):\n${executeToolCall(tu)}`,
        }));

        // Continue conversation with tool results
        response = await chatFn(
          agent.provider,
          agent.model,
          [
            { role: 'user', content: subtask.description },
            { role: 'assistant', content: extResponse.content || 'Using tools...' },
            ...toolResults,
          ],
          agent.systemPrompt,
          chatOptions,
        );

        iterations++;
      }

      // Collect final result
      if (response.content) resultParts.push(response.content);
      const finalResult = resultParts.join('\n\n');

      // Task → DONE
      const done = await db.updateTask(subtask.id, { status: TaskStatus.DONE, result: finalResult });
      broadcastTaskUpdate(wss, projectId, done);

      // Agent back to IDLE
      await setAgentIdle(db, wss, projectId, agent.id);
    } catch (err) {
      const failed = await db.updateTask(subtask.id, { status: TaskStatus.FAILED, error: String(err) });
      broadcastTaskUpdate(wss, projectId, failed);

      await setAgentIdle(db, wss, projectId, agent.id);
    }
  }
}
