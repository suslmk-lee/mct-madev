import { Router, type Request, type Response } from 'express';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';
import {
  PMAgent,
  TaskStatus,
  AgentVisualState,
  EventType,
  SkillLoader,
  type Agent,
  type Task,
  type GatewayChatFn,
  type SkillDefinition,
  type ExtendedChatResponse,
} from '@mct-madev/core';

function getDb(req: Request): ServerDatabase { return req.app.locals.db as ServerDatabase; }
function getWss(req: Request): WebSocketManager | undefined { return req.app.locals.wss as WebSocketManager | undefined; }
function getChatFn(req: Request): GatewayChatFn | undefined { return req.app.locals.chatFn as GatewayChatFn | undefined; }
function getSkillLoader(req: Request): SkillLoader | undefined { return req.app.locals.skillLoader as SkillLoader | undefined; }
function param(req: Request, name: string): string { const v = req.params[name]; return Array.isArray(v) ? v[0] : v; }

// ── Broadcast helpers ──
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

// ── Intent classification ──

// Keyword-based pre-check (works regardless of LLM quality)
const DIRECTIVE_PATTERNS = [
  // Korean directive keywords
  /개발|구현|만들어|생성|제작|작성|빌드|코딩/,
  /수정|변경|바꿔|고쳐|업데이트|리팩토링|리팩터/,
  /삭제|제거|없애|지워/,
  /추가|넣어|붙여|포함/,
  /배포|디플로이|설치|설정/,
  /테스트|검증|검토|리뷰|확인해/,
  /해줘|해주세요|하세요|해라|하라|합시다|하자/,
  /페이지|컴포넌트|기능|API|서버|DB|데이터베이스/,
  /버그|에러|오류|문제.*해결|fix/i,
  // English directive keywords
  /\b(implement|develop|build|create|make|code|write)\b/i,
  /\b(fix|repair|debug|resolve|patch)\b/i,
  /\b(add|remove|delete|update|modify|change|refactor)\b/i,
  /\b(deploy|test|review|check|validate|verify)\b/i,
  /\b(feature|page|component|endpoint|route|function)\b/i,
];

const CHAT_PATTERNS = [
  /^(안녕|하이|헬로|ㅎㅇ|hi|hello|hey)\b/i,
  /^(고마워|감사|ㄳ|thanks|thank you)\b/i,
  /뭐해\??$|어때\??$|어떠?\??$/,
  /\?$/,  // ends with question mark (weak signal)
];

function keywordClassify(message: string): { intent: 'chat' | 'directive' | 'uncertain'; confidence: number } {
  const directiveHits = DIRECTIVE_PATTERNS.filter((p) => p.test(message)).length;
  const chatHits = CHAT_PATTERNS.filter((p) => p.test(message)).length;

  // Strong directive signal (2+ keyword matches)
  if (directiveHits >= 2) return { intent: 'directive', confidence: 0.85 };
  // Single directive keyword + no chat signals
  if (directiveHits === 1 && chatHits === 0) return { intent: 'directive', confidence: 0.7 };
  // Pure chat signals
  if (chatHits > 0 && directiveHits === 0) return { intent: 'chat', confidence: 0.75 };

  return { intent: 'uncertain', confidence: 0.3 };
}

const CLASSIFY_PROMPT = `You are a message intent classifier. Classify the user's message into one of these categories:
- "chat": casual conversation, greeting, question, brainstorming, discussion, opinion request, asking about something
- "directive": work instruction, task assignment, feature request, bug fix, implementation request, asking to build/create/develop something

The user may write in Korean or English. Examples:
- "자기소개 페이지를 개발해줘" → directive
- "로그인 기능 추가해" → directive
- "안녕, 오늘 어때?" → chat
- "이 프로젝트에 대해 설명해줘" → chat
- "API 엔드포인트 만들어줘" → directive
- "What do you think about React?" → chat
- "Build a landing page" → directive

Respond with ONLY a JSON object: {"intent": "chat" | "directive", "confidence": 0.0-1.0}
No explanation, no markdown fences, no extra text.`;

async function classifyIntent(
  chatFn: GatewayChatFn,
  agent: Agent,
  message: string,
): Promise<{ intent: 'chat' | 'directive'; confidence: number }> {
  // 1. Keyword pre-check — fast and reliable
  const kwResult = keywordClassify(message);
  if (kwResult.intent !== 'uncertain' && kwResult.confidence >= 0.7) {
    return { intent: kwResult.intent, confidence: kwResult.confidence };
  }

  // 2. LLM classification for ambiguous messages
  try {
    const response = await chatFn(
      agent.provider,
      agent.model,
      [
        { role: 'system', content: CLASSIFY_PROMPT },
        { role: 'user', content: message },
      ],
    );

    // Try to extract JSON even if wrapped in markdown fences or extra text
    const raw = response.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*?"intent"\s*:\s*"(chat|directive)"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: parsed.intent === 'directive' ? 'directive' : 'chat',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
      };
    }

    // Fallback: check if the raw response contains directive/chat keyword
    if (/directive/i.test(raw)) return { intent: 'directive', confidence: 0.55 };
    if (/chat/i.test(raw)) return { intent: 'chat', confidence: 0.55 };
  } catch {
    // LLM failed — fall through to keyword result
  }

  // 3. Final fallback: use keyword result even if uncertain, bias toward directive if any signal
  if (kwResult.intent === 'directive') return { intent: 'directive', confidence: 0.5 };

  // If truly ambiguous and message is long (>20 chars), lean toward directive
  if (message.length > 20 && kwResult.intent === 'uncertain') {
    return { intent: 'directive', confidence: 0.45 };
  }

  return { intent: 'chat', confidence: 0.5 };
}

// ── Batch assignment: distribute subtasks across agents evenly ──

const ROLE_KEYWORDS: Record<string, string[]> = {
  DEVELOPER: ['implement', 'code', 'develop', 'build', 'create', 'fix', 'bug', 'feature', 'refactor', 'frontend', 'backend', 'api', '개발', '구현', '코드', '프론트', '백엔드', '서버', '클라이언트', 'ui', 'page', 'component', 'design', 'html', 'css'],
  REVIEWER: ['review', 'check', 'inspect', 'audit', '리뷰', '검토'],
  TESTER: ['test', 'qa', 'quality', 'verify', 'validation', '테스트', '검증'],
  DEVOPS: ['deploy', 'ci', 'cd', 'infra', 'docker', 'kubernetes', 'pipeline', '배포', '인프라'],
  PM: ['plan', 'coordinate', 'manage', 'schedule', '기획', '관리'],
};

/** Determine best role for a subtask */
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

/**
 * Assign subtasks to agents with round-robin load balancing.
 * Groups subtasks by target role, then distributes evenly among agents of that role.
 */
function assignSubtasks(
  agents: Agent[],
  subtaskDefs: Array<{ title: string; description: string; assignee?: string }>,
): Map<number, Agent> {
  const result = new Map<number, Agent>();
  const workers = agents.filter((a) => a.role !== 'PM');
  if (workers.length === 0) return result;

  // Track assignments per agent for this batch
  const assignCount = new Map<string, number>();
  for (const a of workers) assignCount.set(a.id, 0);

  // Group agents by role
  const agentsByRole = new Map<string, Agent[]>();
  for (const a of workers) {
    const list = agentsByRole.get(a.role) ?? [];
    list.push(a);
    agentsByRole.set(a.role, list);
  }

  // For each subtask, determine role and pick least-loaded agent of that role
  for (let i = 0; i < subtaskDefs.length; i++) {
    const sub = subtaskDefs[i];
    const role = detectBestRole(sub);
    let candidates = agentsByRole.get(role);

    // If no agents of this role, fall back to all workers
    if (!candidates || candidates.length === 0) {
      candidates = workers;
    }

    // Pick agent with fewest assignments (round-robin)
    candidates.sort((a, b) => (assignCount.get(a.id) ?? 0) - (assignCount.get(b.id) ?? 0));
    const picked = candidates[0];
    result.set(i, picked);
    assignCount.set(picked.id, (assignCount.get(picked.id) ?? 0) + 1);
  }

  return result;
}

/** Single agent matching (for executeSubtasks fallback) */
function matchAgent(agents: Agent[], sub: { title: string; description: string }): Agent | undefined {
  const role = detectBestRole(sub);
  const candidates = agents.filter((a) => a.role === role && a.role !== 'PM');
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  const workers = agents.filter((a) => a.role !== 'PM');
  return workers.length > 0 ? workers[Math.floor(Math.random() * workers.length)] : undefined;
}

// ── Auto-create agent for role ──
async function ensureAgentForRole(
  db: ServerDatabase,
  wss: WebSocketManager | undefined,
  projectId: string,
  role: string,
  agents: Agent[],
): Promise<Agent> {
  const existing = agents.find((a) => a.role === role);
  if (existing) return existing;

  const { assignPosition } = await import('@mct-madev/core');
  const position = assignPosition(role, agents);

  const roleDefaults: Record<string, { name: string; provider: string; model: string }> = {
    DEVELOPER: { name: 'Auto-Dev', provider: 'ollama', model: 'qwen3' },
    REVIEWER: { name: 'Auto-Reviewer', provider: 'ollama', model: 'qwen3' },
    TESTER: { name: 'Auto-Tester', provider: 'ollama', model: 'qwen3' },
    DEVOPS: { name: 'Auto-DevOps', provider: 'ollama', model: 'qwen3' },
    PM: { name: 'Auto-PM', provider: 'ollama', model: 'qwen3' },
  };

  const defaults = roleDefaults[role] ?? roleDefaults.DEVELOPER;

  // Try to use the same provider/model as existing agents
  const referenceAgent = agents[0];
  const provider = referenceAgent?.provider ?? defaults.provider;
  const model = referenceAgent?.model ?? defaults.model;

  const newAgent = await db.createAgent({
    projectId,
    name: defaults.name,
    role: role as Agent['role'],
    provider,
    model,
    visualState: AgentVisualState.IDLE,
    position,
    metadata: { autoCreated: true },
  });

  broadcastAgentUpdate(wss, projectId, newAgent);
  return newAgent;
}

// ── Chat status broadcast ──
function broadcastChatStatus(
  wss: WebSocketManager | undefined,
  projectId: string,
  message: string,
  sender: string,
  chatHistory?: Array<{ role: string; content: string; sender?: string; timestamp: string }>,
): void {
  const msg = {
    role: 'assistant',
    content: message,
    sender,
    timestamp: new Date().toISOString(),
  };
  if (chatHistory) chatHistory.push(msg);
  if (wss) {
    wss.broadcastToProject(projectId, {
      type: 'chat:message' as never,
      timestamp: msg.timestamp,
      payload: msg,
    });
  }
}

// ── Execute subtasks (with auto agent creation + chat progress) ──
async function executeSubtasks(
  db: ServerDatabase,
  wss: WebSocketManager | undefined,
  projectId: string,
  chatFn: GatewayChatFn,
  agents: Agent[],
  subtasks: Array<{ id: string; assigneeAgentId?: string; title: string; description: string }>,
  skillLoader?: SkillLoader,
  pmName?: string,
  chatHistory?: Array<{ role: string; content: string; sender?: string; timestamp: string }>,
): Promise<void> {
  const allSkills = skillLoader?.loadSkills() ?? [];
  const currentAgents = [...agents];
  const pm = pmName ?? 'PM';
  const total = subtasks.length;
  let doneCount = 0;
  let failedCount = 0;

  for (let idx = 0; idx < subtasks.length; idx++) {
    const subtask = subtasks[idx];
    let agent = currentAgents.find((a) => a.id === subtask.assigneeAgentId);

    // Auto-create agent if no assignee found
    if (!agent && subtask.assigneeAgentId) {
      const intendedAgent = agents.find((a) => a.id === subtask.assigneeAgentId);
      if (intendedAgent) agent = intendedAgent;
    }
    if (!agent) {
      const matched = matchAgent(currentAgents, subtask);
      if (matched) {
        agent = matched;
      } else {
        agent = await ensureAgentForRole(db, wss, projectId, 'DEVELOPER', currentAgents);
        currentAgents.push(agent);
      }
      await db.updateTask(subtask.id, { assigneeAgentId: agent.id });
    }

    // Notify chat: task starting
    broadcastChatStatus(
      wss, projectId,
      `[${idx + 1}/${total}] ${subtask.title} 시작 → ${agent.name}`,
      pm, chatHistory,
    );

    try {
      const updated = await db.updateAgent(agent.id, { visualState: AgentVisualState.WORKING });
      broadcastAgentUpdate(wss, projectId, updated);

      const inProgress = await db.updateTask(subtask.id, { status: TaskStatus.IN_PROGRESS });
      broadcastTaskUpdate(wss, projectId, inProgress);

      const selectedSkills = skillLoader
        ? skillLoader.selectSkills(allSkills, agent.role, subtask.description)
        : [];

      const chatOptions = selectedSkills.length > 0
        ? { tools: selectedSkills, tool_choice: 'auto' as const }
        : undefined;

      const response = await chatFn(
        agent.provider,
        agent.model,
        [{ role: 'user', content: subtask.description }],
        agent.systemPrompt,
        chatOptions,
      );

      const done = await db.updateTask(subtask.id, { status: TaskStatus.DONE, result: response.content });
      broadcastTaskUpdate(wss, projectId, done);

      const idle = await db.updateAgent(agent.id, { visualState: AgentVisualState.IDLE });
      broadcastAgentUpdate(wss, projectId, idle);

      doneCount++;
      // Notify chat: task completed
      const preview = response.content.length > 80
        ? response.content.slice(0, 80) + '...'
        : response.content;
      broadcastChatStatus(
        wss, projectId,
        `✓ ${subtask.title} 완료 (${agent.name})\n${preview}`,
        pm, chatHistory,
      );
    } catch (err) {
      const failed = await db.updateTask(subtask.id, { status: TaskStatus.FAILED, error: String(err) });
      broadcastTaskUpdate(wss, projectId, failed);

      const idle = await db.updateAgent(agent.id, { visualState: AgentVisualState.IDLE });
      broadcastAgentUpdate(wss, projectId, idle);

      failedCount++;
      // Notify chat: task failed
      const errMsg = String(err).length > 100 ? String(err).slice(0, 100) + '...' : String(err);
      broadcastChatStatus(
        wss, projectId,
        `✗ ${subtask.title} 실패 (${agent.name})\n${errMsg}`,
        pm, chatHistory,
      );
    }
  }

  // Final summary
  const summary = failedCount > 0
    ? `전체 작업 완료: ${doneCount}/${total} 성공, ${failedCount}/${total} 실패`
    : `전체 ${total}개 작업이 모두 성공적으로 완료되었습니다.`;
  broadcastChatStatus(wss, projectId, summary, pm, chatHistory);
}

// ── Router ──
export function createChatRouter(): Router {
  const router = Router();

  // Chat history per project
  const chatHistories = new Map<string, Array<{ role: string; content: string; sender?: string; timestamp: string }>>();

  // POST /projects/:projectId/chat
  router.post('/projects/:projectId/chat', async (req: Request, res: Response) => {
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const chatFn = getChatFn(req);
      const projectId = param(req, 'projectId');
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      if (!chatFn) {
        res.status(500).json({ error: 'Chat function not available.' });
        return;
      }

      const agents = await db.listAgents(projectId);
      const pmAgent = agents.find((a) => a.role === 'PM');
      if (!pmAgent) {
        res.status(400).json({ error: 'No PM agent found. Add a PM agent first.' });
        return;
      }

      // Get or create chat history
      if (!chatHistories.has(projectId)) chatHistories.set(projectId, []);
      const history = chatHistories.get(projectId)!;

      // Add user message
      const userMsg = { role: 'user', content: message, sender: 'CEO', timestamp: new Date().toISOString() };
      history.push(userMsg);

      // User message is added optimistically by the client — no broadcast needed

      // PM starts thinking
      const pmWorking = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.WORKING });
      broadcastAgentUpdate(wss, projectId, pmWorking);

      // 1. Classify intent
      const { intent } = await classifyIntent(chatFn, pmAgent, message);

      let responseContent: string;
      let subtasks: Array<{ id: string; title: string; assigneeName?: string; status: string }> = [];

      if (intent === 'chat') {
        // ── Chat mode: PM responds conversationally ──
        const contextMessages = history.slice(-20).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const response = await chatFn(
          pmAgent.provider,
          pmAgent.model,
          contextMessages,
          pmAgent.systemPrompt ?? 'You are a friendly and competent project manager. Have natural conversations, help brainstorm ideas, answer questions, and provide guidance. When the user clearly asks for work to be done, let them know you can handle it.',
        );

        responseContent = response.content;
      } else {
        // ── Directive mode: decompose and execute ──
        const pm = new PMAgent();
        const pmChatFn = async (msgs: { role: string; content: string }[]) => {
          const result = await chatFn(pmAgent.provider, pmAgent.model, msgs as never, pmAgent.systemPrompt);
          return result as import('@mct-madev/core').ChatResponse;
        };

        // Create root task
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

        let subtaskDefs;
        try {
          subtaskDefs = await pm.decompose(
            rootTask as never,
            pmChatFn,
            agents.map((a) => ({ name: a.name, role: a.role, id: a.id })),
          );
        } catch (err) {
          await db.updateTask(rootTask.id, { status: TaskStatus.DONE, result: `Decompose failed: ${err}` });
          responseContent = `계획 수립에 문제가 있었습니다: ${err}`;

          const pmIdle = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.IDLE });
          broadcastAgentUpdate(wss, projectId, pmIdle);

          const assistantMsg = { role: 'assistant', content: responseContent, sender: pmAgent.name, timestamp: new Date().toISOString() };
          history.push(assistantMsg);
          if (wss) wss.broadcastToProject(projectId, { type: 'chat:message' as never, timestamp: new Date().toISOString(), payload: assistantMsg });

          res.json({ data: { intent, response: responseContent, subtasks: [] } });
          return;
        }

        // Update root task
        await db.updateTask(rootTask.id, { status: TaskStatus.DONE, result: JSON.stringify(subtaskDefs) });

        // Batch-assign subtasks across agents evenly
        const assignments = assignSubtasks(agents, subtaskDefs);
        const createdSubtasks = [];
        for (let i = 0; i < subtaskDefs.length; i++) {
          const sub = subtaskDefs[i];
          let assignee = assignments.get(i);

          // Auto-create agent if no worker available
          if (!assignee) {
            const neededRole = detectNeededRole(sub);
            assignee = await ensureAgentForRole(db, wss, projectId, neededRole, agents);
            agents.push(assignee);
          }

          const subtask = await db.createTask({
            projectId,
            parentTaskId: rootTask.id,
            title: sub.title,
            description: sub.description,
            status: TaskStatus.CREATED,
            assigneeAgentId: assignee?.id,
            priority: sub.priority,
            dependencies: [],
            metadata: { parentDirective: rootTask.id },
          });
          broadcastTaskUpdate(wss, projectId, subtask);
          createdSubtasks.push({ ...subtask, assigneeName: assignee?.name });
        }

        subtasks = createdSubtasks.map((s) => ({
          id: s.id,
          title: s.title,
          assigneeName: s.assigneeName,
          status: s.status,
        }));

        // Build response message
        const taskList = subtasks.map((s) => `  - ${s.title} → ${s.assigneeName ?? 'unassigned'}`).join('\n');
        responseContent = `업무를 ${subtasks.length}개 하위 작업으로 분해했습니다. 실행을 시작합니다.\n\n${taskList}`;

        // Execute asynchronously
        const skillLoader = getSkillLoader(req);
        executeSubtasks(db, wss, projectId, chatFn, agents, createdSubtasks, skillLoader, pmAgent.name, history).catch(() => {});
      }

      // PM back to idle
      const pmIdle = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.IDLE });
      broadcastAgentUpdate(wss, projectId, pmIdle);

      // Save assistant message
      const assistantMsg = { role: 'assistant', content: responseContent, sender: pmAgent.name, timestamp: new Date().toISOString() };
      history.push(assistantMsg);

      // Broadcast to UI
      if (wss) {
        wss.broadcastToProject(projectId, {
          type: 'chat:message' as never,
          timestamp: new Date().toISOString(),
          payload: assistantMsg,
        });
      }

      res.json({
        data: {
          intent,
          response: responseContent,
          subtasks,
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'Chat failed', detail: String(err) });
    }
  });

  // GET /projects/:projectId/chat/history
  router.get('/projects/:projectId/chat/history', (req: Request, res: Response) => {
    const projectId = param(req, 'projectId');
    const history = chatHistories.get(projectId) ?? [];
    res.json({ data: history });
  });

  // DELETE /projects/:projectId/chat/history
  router.delete('/projects/:projectId/chat/history', (req: Request, res: Response) => {
    const projectId = param(req, 'projectId');
    chatHistories.delete(projectId);
    res.json({ message: 'Chat history cleared' });
  });

  return router;
}

// ── Helper: detect needed role from subtask content ──
function detectNeededRole(sub: { title: string; description: string }): string {
  const text = `${sub.title} ${sub.description}`.toLowerCase();
  if (/test|qa|quality|verify|검증|테스트/.test(text)) return 'TESTER';
  if (/review|audit|inspect|검토|리뷰/.test(text)) return 'REVIEWER';
  if (/deploy|ci|cd|infra|docker|배포/.test(text)) return 'DEVOPS';
  if (/plan|coordinate|manage|기획/.test(text)) return 'PM';
  return 'DEVELOPER';
}
