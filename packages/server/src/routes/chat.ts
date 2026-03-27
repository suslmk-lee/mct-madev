import { Router, type Request, type Response } from 'express';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import type { ServerDatabase } from '../database.js';
import type { WebSocketManager } from '../websocket/index.js';
import { logger } from '../logger.js';
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
  type ContentBlock,
  type ChatMessage,
} from '@mct-madev/core';

// ── Built-in file system tools ────────────────────────────────────────────

/** Built-in file system tools given to every agent */
const FILE_TOOLS: SkillDefinition[] = [
  {
    name: 'write_file',
    description: 'Write content to a file in the project directory. Use this for EVERY file you create or modify. Do NOT output code in your text response — always use this tool.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from project root, e.g. src/index.ts or Dockerfile' },
        content: { type: 'string', description: 'Complete file content. Never truncate.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the current content of an existing file in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from project root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List files and directories in a path. Use to explore project structure before writing files.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from project root. Use "." for root.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a text pattern across all files in the project.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text or regex pattern to search for' },
        path: { type: 'string', description: 'Optional: subdirectory to limit search scope' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the project directory.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path of the file to delete' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory (and any parent directories) in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path of the directory to create' },
      },
      required: ['path'],
    },
  },
];

const ROLE_PROMPTS: Record<string, string> = {
  DEVELOPER: `You are a software developer. Write clean, complete, production-ready code.

CRITICAL RULES FOR HTML FILES:
- If creating index.html for a simple/medium project: write the COMPLETE file with ALL content inline.
  Include actual visible content (text, buttons, UI elements) in the HTML body.
  Embed all CSS in <style> tags and all JS in <script> tags.
  The file MUST work when opened directly in a browser with NO build step.
- Never create an empty or skeleton HTML file. Every HTML file must have real, functional content.
- For React/TypeScript projects only: index.html may have just <div id="root"> with a script module tag.

Always use the write_file tool for every file you create or modify.`,
  REVIEWER: 'You are a code reviewer. Review code for correctness, security, performance, and style. Be constructive and specific. Use write_file for any corrected files.',
  TESTER: 'You are a QA engineer. Write comprehensive tests covering happy path, edge cases, and error scenarios. Use write_file to output test files.',
  DEVOPS: 'You are a DevOps engineer. Focus on deployment, monitoring, CI/CD, and infrastructure as code. Use write_file for all config and script files.',
  PM: 'You are a project manager. Coordinate tasks, review deliverables, and ensure quality.',
};

/** Execute a single tool call. Returns the result string to feed back to LLM. */
function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  targetPath: string,
  writtenFiles: string[],
): string {
  const WRITE_FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const READ_FILE_MAX_BYTES = 1 * 1024 * 1024;   // 1 MB

  if (toolName === 'write_file') {
    const filePath = String(input.path ?? '').trim();
    const content = String(input.content ?? '');
    if (!filePath) return 'Error: path is required';
    if (Buffer.byteLength(content, 'utf-8') > WRITE_FILE_MAX_BYTES) {
      return `Error: content exceeds 10 MB limit (${(Buffer.byteLength(content, 'utf-8') / 1024 / 1024).toFixed(1)} MB)`;
    }

    const safe = filePath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
    const abs = resolve(targetPath, safe);
    if (!abs.startsWith(resolve(targetPath))) return 'Error: path traversal denied';

    try {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf-8');
      writtenFiles.push(safe);
      return `OK: ${safe} written (${content.length} bytes)`;
    } catch (e) {
      return `Error writing ${safe}: ${e}`;
    }
  }

  if (toolName === 'read_file') {
    const filePath = String(input.path ?? '').trim();
    const safe = filePath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
    const abs = resolve(targetPath, safe);
    if (!abs.startsWith(resolve(targetPath))) return 'Error: path traversal denied';
    try {
      if (!existsSync(abs)) return `Error: ${safe} does not exist`;
      const st = statSync(abs);
      if (st.size > READ_FILE_MAX_BYTES) {
        return `Error: ${safe} is too large to read (${(st.size / 1024 / 1024).toFixed(1)} MB, limit 1 MB). Use search_code to find specific sections.`;
      }
      return readFileSync(abs, 'utf-8');
    } catch (e) {
      return `Error reading ${safe}: ${e}`;
    }
  }

  if (toolName === 'list_files') {
    const dirPath = String(input.path ?? '.').trim();
    const safe = dirPath === '.' ? '' : dirPath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
    const abs = resolve(targetPath, safe || '.');
    if (!abs.startsWith(resolve(targetPath))) return 'Error: path traversal denied';
    try {
      const IGNORE = new Set(['node_modules', '.git', 'dist', '.cache']);
      const lines: string[] = [];
      function listDir(dir: string, prefix: string, depth: number): void {
        if (depth > 3) return;
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const entry of entries.sort()) {
          if (IGNORE.has(entry)) continue;
          const full = join(dir, entry);
          let st;
          try { st = statSync(full); } catch { continue; }
          if (st.isDirectory()) {
            lines.push(`${prefix}${entry}/`);
            listDir(full, `${prefix}  `, depth + 1);
          } else {
            lines.push(`${prefix}${entry}`);
          }
        }
      }
      listDir(abs, '', 0);
      return lines.length > 0 ? lines.join('\n') : '(empty directory)';
    } catch (e) {
      return `Error listing ${dirPath}: ${e}`;
    }
  }

  if (toolName === 'search_code') {
    const pattern = String(input.pattern ?? '').trim();
    if (!pattern) return 'Error: pattern is required';
    const searchPath = input.path ? String(input.path).trim() : '';
    const safe = searchPath ? searchPath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '') : '';
    const abs = resolve(targetPath, safe || '.');
    if (!abs.startsWith(resolve(targetPath))) return 'Error: path traversal denied';
    try {
      const IGNORE = new Set(['node_modules', '.git', 'dist']);
      const matches: string[] = [];
      const regex = new RegExp(pattern, 'i');
      function searchDir(dir: string): void {
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const entry of entries) {
          if (IGNORE.has(entry)) continue;
          const full = join(dir, entry);
          let st;
          try { st = statSync(full); } catch { continue; }
          if (st.isDirectory()) {
            searchDir(full);
          } else if (st.isFile() && st.size < 500_000) {
            try {
              const text = readFileSync(full, 'utf-8');
              const lines = text.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  const rel = relative(targetPath, full).replace(/\\/g, '/');
                  matches.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
                  if (matches.length >= 50) return;
                }
              }
            } catch { /* skip binary/unreadable files */ }
          }
        }
      }
      searchDir(abs);
      return matches.length > 0 ? matches.join('\n') : `No matches found for: ${pattern}`;
    } catch (e) {
      return `Error searching: ${e}`;
    }
  }

  if (toolName === 'delete_file') {
    const filePath = String(input.path ?? '').trim();
    if (!filePath) return 'Error: path is required';
    const safe = filePath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
    const abs = resolve(targetPath, safe);
    if (!abs.startsWith(resolve(targetPath))) return 'Error: path traversal denied';
    try {
      if (!existsSync(abs)) return `Error: ${safe} does not exist`;
      rmSync(abs);
      logger.info({ path: safe, targetPath }, 'File deleted by agent');
      return `OK: ${safe} deleted`;
    } catch (e) {
      return `Error deleting ${safe}: ${e}`;
    }
  }

  if (toolName === 'create_directory') {
    const dirPath = String(input.path ?? '').trim();
    if (!dirPath) return 'Error: path is required';
    const safe = dirPath.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
    const abs = resolve(targetPath, safe);
    if (!abs.startsWith(resolve(targetPath))) return 'Error: path traversal denied';
    try {
      mkdirSync(abs, { recursive: true });
      return `OK: ${safe} created`;
    } catch (e) {
      return `Error creating ${safe}: ${e}`;
    }
  }

  return `Unknown tool: ${toolName}`;
}

// ── File writing helpers (regex fallback) ─────────────────────────────────

/**
 * Parse code blocks with file paths from LLM text response (fallback).
 */
function extractFiles(
  content: string,
  taskTitle?: string,
): Array<{ path: string; code: string }> {
  const files: Array<{ path: string; code: string }> = [];
  let m: RegExpExecArray | null;

  // Format 1: ## File: path  (heading before fence)
  const headingPattern =
    /(?:^|\n)#{1,3}\s+(?:File|파일|filename|path):\s*[`']?([^\n`']+)[`']?\n```[^\n]*\n([\s\S]*?)```/gi;
  while ((m = headingPattern.exec(content)) !== null) {
    files.push({ path: m[1].trim(), code: m[2] });
  }

  // Format 2: **`path/to/file`** or **path/to/file** before fence
  const boldPathPattern =
    /\*\*`?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`?\*\*\s*\n```[^\n]*\n([\s\S]*?)```/g;
  while ((m = boldPathPattern.exec(content)) !== null) {
    const filePath = m[1].trim();
    if (!files.some((f) => f.path === filePath)) {
      files.push({ path: filePath, code: m[2] });
    }
  }

  // Format 3: ```lang:path/to/file  (inline path in fence)
  const fenceWithPathPattern = /```[a-zA-Z0-9_-]+:([^\n]+)\n([\s\S]*?)```/g;
  while ((m = fenceWithPathPattern.exec(content)) !== null) {
    const filePath = m[1].trim();
    if (!files.some((f) => f.path === filePath)) {
      files.push({ path: filePath, code: m[2] });
    }
  }

  // Format 4: // filename: path  or # filename: path  (comment inside fence)
  const commentFilenamePattern = /```[^\n]*\n(?:\/\/|#)\s*(?:filename|file|path):\s*([^\n]+)\n([\s\S]*?)```/gi;
  while ((m = commentFilenamePattern.exec(content)) !== null) {
    const filePath = m[1].trim();
    const code = m[2];
    if (!files.some((f) => f.path === filePath)) {
      files.push({ path: filePath, code });
    }
  }

  // Format 5: Fallback — any code fence with identifiable extension
  // Only use when no named files found, to avoid duplicates
  if (files.length === 0) {
    const anyFencePattern = /```([^\n]*)\n([\s\S]*?)```/g;
    let idx = 0;
    while ((m = anyFencePattern.exec(content)) !== null) {
      const lang = m[1].trim().toLowerCase();
      const code = m[2];
      if (!code.trim() || !lang) continue;

      // Derive extension from language hint
      const extMap: Record<string, string> = {
        typescript: 'ts', ts: 'ts', tsx: 'tsx',
        javascript: 'js', js: 'js', jsx: 'jsx',
        python: 'py', py: 'py',
        bash: 'sh', sh: 'sh', shell: 'sh',
        dockerfile: 'Dockerfile',
        yaml: 'yaml', yml: 'yaml',
        json: 'json',
        css: 'css', scss: 'scss',
        html: 'html',
        sql: 'sql',
        go: 'go', rust: 'rs', java: 'java',
      };
      const ext = extMap[lang] ?? lang;
      if (!ext) continue;

      // Derive base name from task title
      const baseName = taskTitle
        ? taskTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40)
        : `output-${idx}`;

      const filename = ext === 'Dockerfile' ? 'Dockerfile' : `${baseName}-${idx}.${ext}`;
      files.push({ path: filename, code });
      idx++;
    }
  }

  return files;
}

function writeFiles(repoPath: string, files: Array<{ path: string; code: string }>): { written: string[]; failed: string[] } {
  const written: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const safePath = file.path.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:[\\/]?/, '');
    if (!safePath) continue;
    const absPath = resolve(repoPath, safePath);
    if (!absPath.startsWith(resolve(repoPath))) continue;
    try {
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, file.code, 'utf-8');
      written.push(safePath);
    } catch (err) {
      logger.error({ err: String(err), path: safePath }, 'Failed to write file');
      failed.push(safePath);
    }
  }
  return { written, failed };
}

/** Build system prompt that instructs agent to output files in parseable format */
function buildAgentSystemPrompt(basePrompt: string | undefined, repoPath: string): string {
  const fileInstruction = `IMPORTANT: You are a software development agent. Your primary output MUST be working code files.

For EVERY task that involves creating, modifying, or configuring code:
1. Output each file using EXACTLY this format:

## File: relative/path/to/file.ext
\`\`\`language
(complete file content — never truncate)
\`\`\`

2. Use paths relative to the project root. Example: src/index.ts, Dockerfile, package.json
3. Output ALL files required — do not skip any file
4. After outputting all files, write a brief summary of what was implemented

Project root: ${repoPath}

DO NOT write prose guides or step-by-step instructions. Write actual code files.`;

  return basePrompt ? `${fileInstruction}\n\n${basePrompt}` : fileInstruction;
}

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

  // 3. Final fallback: only treat as directive if keyword match was definitive
  // Default to chat to avoid accidental orchestration on ambiguous input
  if (kwResult.intent === 'directive') return { intent: 'directive', confidence: 0.5 };
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

// ── PM Review ──────────────────────────────────────────────────────────────

const PM_REVIEW_PROMPT = `You are a strict but fair Project Manager reviewing an agent's work.

Task title: {TITLE}
Task description: {DESCRIPTION}
Agent's output:
---
{OUTPUT}
---

Evaluate whether the output adequately completes the task.
- APPROVE if: the output contains concrete implementation (actual code, config, or files), is relevant to the task, and is reasonably complete.
- REVISE if: the output is only a conceptual guide/explanation with no actual code, is clearly wrong, is empty, or is missing critical parts.

Respond with ONLY this JSON (no markdown, no extra text):
{"decision":"APPROVE","feedback":""}
or
{"decision":"REVISE","feedback":"Specific actionable instructions for the agent to fix the work."}`;

async function pmReview(
  chatFn: GatewayChatFn,
  pmAgent: Agent,
  subtask: { title: string; description: string },
  agentOutput: string,
): Promise<{ decision: 'APPROVE' | 'REVISE' | 'BLOCKED'; feedback: string }> {
  const prompt = PM_REVIEW_PROMPT
    .replace('{TITLE}', subtask.title)
    .replace('{DESCRIPTION}', subtask.description)
    .replace('{OUTPUT}', agentOutput.slice(0, 3000)); // cap to avoid huge prompts

  try {
    const response = await chatFn(
      pmAgent.provider,
      pmAgent.model,
      [{ role: 'user', content: prompt }],
    );

    const raw = response.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*?"decision"\s*:\s*"(APPROVE|REVISE)"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        decision: parsed.decision === 'APPROVE' ? 'APPROVE' : 'REVISE',
        feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
      };
    }
    // Fallback: if response mentions approve/ok, approve
    if (/approve|승인|ok|good|완료/i.test(raw)) {
      return { decision: 'APPROVE', feedback: '' };
    }
  } catch {
    // PM review failed — block task rather than silently passing bad work
    return { decision: 'BLOCKED', feedback: 'PM review unavailable (provider error). Task blocked to prevent passing incomplete work.' };
  }
  return { decision: 'APPROVE', feedback: '' };
}

// ── Execute subtasks (PM review loop) ──────────────────────────────────────

const MAX_REVIEW_CYCLES = 3;

/** Build topological layers for parallel execution based on title-based dependencies */
function buildDAGLayers<T extends { id: string; title: string; dependencies?: string[] }>(
  subtasks: T[],
): T[][] {
  const titleToId = new Map(subtasks.map((t) => [t.title, t.id]));
  const done = new Set<string>();
  const remaining = new Set(subtasks.map((t) => t.id));
  const layers: Array<typeof subtasks> = [];

  while (remaining.size > 0) {
    const layer: typeof subtasks = [];
    for (const taskId of remaining) {
      const task = subtasks.find((t) => t.id === taskId)!;
      const depIds = (task.dependencies ?? [])
        .map((depTitle) => titleToId.get(depTitle))
        .filter((id): id is string => id !== undefined);
      if (depIds.every((depId) => done.has(depId))) {
        layer.push(task);
      }
    }
    // Cycle guard: if no task is ready, a circular dependency exists — fail fast
    if (layer.length === 0) {
      const cycleIds = [...remaining].join(', ');
      throw new Error(`Circular dependency detected among tasks: ${cycleIds}`);
    }
    for (const task of layer) {
      remaining.delete(task.id);
      done.add(task.id);
    }
    layers.push(layer);
  }
  return layers;
}

async function executeSubtasks(
  db: ServerDatabase,
  wss: WebSocketManager | undefined,
  projectId: string,
  chatFn: GatewayChatFn,
  agents: Agent[],
  subtasks: Array<{ id: string; assigneeAgentId?: string; title: string; description: string; dependencies?: string[] }>,
  skillLoader?: SkillLoader,
  pmAgent?: Agent,
  chatHistory?: Array<{ role: string; content: string; sender?: string; timestamp: string }>,
  repoPath?: string,
): Promise<void> {
  const allSkills = skillLoader?.loadSkills() ?? [];
  const currentAgents = [...agents];
  const pmName = pmAgent?.name ?? 'PM';
  const total = subtasks.length;
  let doneCount = 0;
  let failedCount = 0;
  const targetPath = repoPath ?? process.cwd();

  // ── Single task executor (extracted from loop body) ───────────────────
  async function executeOneTask(subtask: typeof subtasks[number]): Promise<void> {
    let agent = currentAgents.find((a) => a.id === subtask.assigneeAgentId);

    if (!agent && subtask.assigneeAgentId) {
      agent = agents.find((a) => a.id === subtask.assigneeAgentId);
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

    broadcastChatStatus(
      wss, projectId,
      `▶ **${subtask.title}** 시작 → ${agent.name}`,
      pmName, chatHistory,
    );

    try {
      const agentUpdated = await db.updateAgent(agent.id, { visualState: AgentVisualState.WORKING });
      broadcastAgentUpdate(wss, projectId, agentUpdated);

      const inProgress = await db.updateTask(subtask.id, { status: TaskStatus.IN_PROGRESS });
      broadcastTaskUpdate(wss, projectId, inProgress);

      const selectedSkills = skillLoader
        ? skillLoader.selectSkills(allSkills, agent.role, subtask.description)
        : [];
      const chatOptions = selectedSkills.length > 0
        ? { tools: selectedSkills, tool_choice: 'auto' as const }
        : undefined;

      const rolePrompt = ROLE_PROMPTS[agent.role] ?? ROLE_PROMPTS.DEVELOPER;
      const toolInstruction = 'IMPORTANT: Use the write_file tool to create ALL files. Do not output code in text.';
      const effectiveSystemPrompt = agent.systemPrompt
        ? `${rolePrompt}\n\n${agent.systemPrompt}\n\n${toolInstruction}`
        : `${rolePrompt}\n\n${toolInstruction}`;

      // ── Agentic tool execution loop ─────────────────────────────
      // Each "round" = one LLM call + all resulting tool executions
      const writtenFiles: string[] = [];
      let lastResponse = '';
      let approved = false;
      let reviewCycle = 0;

      // Build initial user message
      let currentUserMsg = subtask.description;

      while (!approved && reviewCycle < MAX_REVIEW_CYCLES) {
        const agentMessages: ChatMessage[] = [
          { role: 'user', content: currentUserMsg },
        ];

        // ── Inner tool execution loop ──────────────────────────
        // The agent may need multiple turns to call all write_file tools
        const TOOL_LOOP_LIMIT = 8;
        let toolLoopCount = 0;
        let roundWritten: string[] = [];

        // Stream text chunks back to UI as agent:thinking events
        const thinkingOnChunk = wss
          ? (chunk: string) => {
              wss.broadcastToProject(projectId, {
                type: 'agent:thinking' as never,
                timestamp: new Date().toISOString(),
                payload: { agentId: agent.id, taskId: subtask.id, chunk },
              });
            }
          : undefined;

        while (toolLoopCount < TOOL_LOOP_LIMIT) {
          const toolsForAgent = [...FILE_TOOLS, ...(selectedSkills ?? [])];
          let response: ExtendedChatResponse | Awaited<ReturnType<GatewayChatFn>>;
          try {
            response = await chatFn(
              agent.provider,
              agent.model,
              agentMessages,
              effectiveSystemPrompt,
              { tools: toolsForAgent, tool_choice: 'auto', ...(thinkingOnChunk ? { onChunk: thinkingOnChunk } : {}) },
            );
          } catch (toolErr) {
            const toolErrStr = String(toolErr);
            // Model doesn't support tools — fall back to text-only on same provider
            if (/does not support tools|tool.*not.*support|function.*call|tools.*not.*supported/i.test(toolErrStr)) {
              response = await chatFn(
                agent.provider,
                agent.model,
                agentMessages,
                effectiveSystemPrompt,
                thinkingOnChunk ? { onChunk: thinkingOnChunk } : undefined,
              );
            } else {
              // Try agent's fallback provider/model if configured
              const fallbackProvider = agent.metadata?.fallbackProvider as string | undefined;
              const fallbackModel = agent.metadata?.fallbackModel as string | undefined;
              if (fallbackProvider && fallbackModel) {
                response = await chatFn(
                  fallbackProvider,
                  fallbackModel,
                  agentMessages,
                  effectiveSystemPrompt,
                  { tools: toolsForAgent, tool_choice: 'auto', ...(thinkingOnChunk ? { onChunk: thinkingOnChunk } : {}) },
                );
              } else {
                throw toolErr;
              }
            }
          }

          lastResponse = response.content ?? '';

          // Execute tool calls
          const toolUse = (response as ExtendedChatResponse).toolUse;
          if (toolUse && toolUse.length > 0) {
            // Execute each tool and collect results
            const toolResultBlocks: ContentBlock[] = [];
            for (const tool of toolUse) {
              const result = executeToolCall(tool.name, tool.input, targetPath, roundWritten);
              const isError = result.startsWith('Error');
              toolResultBlocks.push({ type: 'tool_result', tool_use_id: tool.id, content: result, is_error: isError });
              // Log tool call to DB (best-effort)
              if (db.logToolCall) {
                db.logToolCall({ taskId: subtask.id, agentId: agent.id, toolName: tool.name, input: tool.input, result, isError }).catch(() => {});
              }
            }
            writtenFiles.push(...roundWritten);

            // Assistant message: text (if any) + tool_use blocks — required by Anthropic API
            const assistantContent: ContentBlock[] = [];
            if (lastResponse) assistantContent.push({ type: 'text', text: lastResponse });
            for (const tool of toolUse) {
              assistantContent.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
            }
            agentMessages.push({ role: 'assistant', content: assistantContent });
            // User message: tool_result blocks
            agentMessages.push({ role: 'user', content: toolResultBlocks });
            // Context window protection: trim if message history is growing large
            if (agentMessages.length > 6) {
              const estimatedTokens = agentMessages.reduce((sum, m) => {
                const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                return sum + Math.ceil(text.length / 4);
              }, 0);
              if (estimatedTokens > getContextLimit(agent.model) * 0.8) {
                // Keep first user message + most recent 4 messages
                agentMessages.splice(1, agentMessages.length - 5);
              }
            }
            toolLoopCount++;
          } else {
            // No tool calls — agent is done with this round
            break;
          }
        }
        // ── End inner tool loop ────────────────────────────────

        // Regex fallback: if no files written via tools, try to parse text
        if (writtenFiles.length === 0 && lastResponse.length > 50) {
          const textFiles = extractFiles(lastResponse, subtask.title);
          const { written: tw, failed: tf } = writeFiles(targetPath, textFiles);
          writtenFiles.push(...tw);
          if (tf.length > 0) {
            broadcastChatStatus(wss, projectId, `⚠ 파일 쓰기 실패: ${tf.join(', ')}`, pmName, chatHistory);
          }
        }

        // ── PM review ─────────────────────────────────────────
        if (pmAgent && reviewCycle < MAX_REVIEW_CYCLES - 1) {
          const pmWorking = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.WORKING });
          broadcastAgentUpdate(wss, projectId, pmWorking);

          broadcastChatStatus(
            wss, projectId,
            `🔍 [검토 ${reviewCycle + 1}/${MAX_REVIEW_CYCLES}] ${agent.name}의 작업을 검토 중...`,
            pmName, chatHistory,
          );

          // PM reviews based on written files list + agent response
          const reviewContext = writtenFiles.length > 0
            ? `작성된 파일: ${writtenFiles.join(', ')}\n\n에이전트 응답:\n${lastResponse.slice(0, 1500)}`
            : `에이전트 응답 (파일 없음):\n${lastResponse.slice(0, 1500)}`;

          const review = await pmReview(chatFn, pmAgent, subtask, reviewContext);

          const pmIdle = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.IDLE });
          broadcastAgentUpdate(wss, projectId, pmIdle);

          if (review.decision === 'BLOCKED') {
            // PM review provider unavailable — fail safe
            throw new Error(review.feedback);
          } else if (review.decision === 'APPROVE') {
            approved = true;
            broadcastChatStatus(
              wss, projectId,
              `✅ 승인: **${subtask.title}** (${agent.name})`,
              pmName, chatHistory,
            );
          } else {
            reviewCycle++;
            broadcastChatStatus(
              wss, projectId,
              `🔄 보완 요청 [${reviewCycle}/${MAX_REVIEW_CYCLES}] → ${agent.name}\n${review.feedback}`,
              pmName, chatHistory,
            );
            // New round: tell agent what to fix, referencing existing files
            const existingFilesList = writtenFiles.length > 0
              ? `\n\n현재 작성된 파일: ${writtenFiles.join(', ')}`
              : '';
            currentUserMsg = `[PM 피드백]${existingFilesList}\n\n${review.feedback}\n\nwrite_file 툴로 필요한 파일을 수정하거나 추가하세요.`;
          }
        } else {
          approved = true;
        }
        // ── End PM review ──────────────────────────────────────
      }
      // ── End PM review loop ───────────────────────────────────

      const done = await db.updateTask(subtask.id, { status: TaskStatus.DONE, result: lastResponse });
      broadcastTaskUpdate(wss, projectId, done);

      const idle = await db.updateAgent(agent.id, { visualState: AgentVisualState.IDLE });
      broadcastAgentUpdate(wss, projectId, idle);

      const filesSummary = writtenFiles.length > 0
        ? `\n📁 파일 저장: ${writtenFiles.join(', ')}`
        : '';
      broadcastChatStatus(
        wss, projectId,
        `✓ **${subtask.title}** 완료 (${agent.name})${filesSummary}`,
        pmName, chatHistory,
      );

    } catch (err) {
      const failed = await db.updateTask(subtask.id, { status: TaskStatus.FAILED, error: String(err) });
      broadcastTaskUpdate(wss, projectId, failed);

      const idle = await db.updateAgent(agent.id, { visualState: AgentVisualState.IDLE });
      broadcastAgentUpdate(wss, projectId, idle);

      const errMsg = String(err).length > 100 ? String(err).slice(0, 100) + '...' : String(err);
      broadcastChatStatus(
        wss, projectId,
        `✗ **${subtask.title}** 실패 (${agent.name})\n${errMsg}`,
        pmName, chatHistory,
      );
      throw err; // re-throw so caller can count failures
    }
  }
  // ── End executeOneTask ────────────────────────────────────────────────

  // ── Execute tasks in DAG-ordered parallel layers ──────────────────────
  const MAX_CONCURRENT = 5;
  let layers: (typeof subtasks)[];
  try {
    layers = buildDAGLayers(subtasks);
  } catch (cycleErr) {
    logger.error({ err: String(cycleErr), projectId }, 'DAG cycle detected — marking all pending tasks FAILED');
    await Promise.all(subtasks.map((t) =>
      db.updateTask(t.id, { status: 'FAILED' as import('@mct-madev/core').TaskStatus, error: `Dependency cycle: ${cycleErr}` }).catch(() => {}),
    ));
    broadcastChatStatus(wss, projectId, `오류: 태스크 간 순환 의존성이 감지되어 실행을 중단했습니다.`, pmName, chatHistory);
    return;
  }

  for (const layer of layers) {
    for (let i = 0; i < layer.length; i += MAX_CONCURRENT) {
      const batch = layer.slice(i, i + MAX_CONCURRENT);
      const results = await Promise.allSettled(batch.map((task) => withTaskTimeout(executeOneTask(task))));
      for (const result of results) {
        if (result.status === 'fulfilled') {
          doneCount++;
        } else {
          failedCount++;
        }
      }
    }
  }

  const summary = failedCount > 0
    ? `전체 작업 완료: ${doneCount}/${total} 성공, ${failedCount}/${total} 실패`
    : `🎉 전체 ${total}개 작업이 모두 완료되었습니다.`;
  broadcastChatStatus(wss, projectId, summary, pmName, chatHistory);

  // ── Final PM review: check for missing files + generate HOW_TO_RUN.md ──
  if (pmAgent) {
    try {
      await finalizeProject(
        chatFn, pmAgent, targetPath, db, wss, projectId, pmName, chatHistory,
      );
    } catch { /* non-critical */ }
  }
}

// ── Project finalization (PM final check + HOW_TO_RUN.md) ──────────────────

async function finalizeProject(
  chatFn: GatewayChatFn,
  pmAgent: Agent,
  targetPath: string,
  db: ServerDatabase,
  wss: WebSocketManager | undefined,
  projectId: string,
  pmName: string,
  chatHistory?: Array<{ role: string; content: string; sender?: string; timestamp: string }>,
): Promise<void> {
  // Collect all files written to the project directory
  const allFiles = collectProjectFiles(targetPath);
  if (allFiles.length === 0) return;

  broadcastChatStatus(wss, projectId,
    `🔎 PM이 생성된 파일을 검토하고 실행 가이드를 작성합니다...`,
    pmName, chatHistory,
  );

  const pmWorking = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.WORKING });
  broadcastAgentUpdate(wss, pmAgent.projectId ?? projectId, pmWorking);

  const finalizationPrompt = `You are a project manager. The development team has completed their work.

Project directory: ${targetPath}
Generated files:
${allFiles.map((f) => `  - ${f}`).join('\n')}

Your tasks:
1. Review the file list and identify any CRITICAL missing files needed to run the project (e.g., package.json, index.html, main entry point, tsconfig.json, vite.config.ts, etc.)
2. Use write_file to create any missing critical files with sensible defaults
3. Write a HOW_TO_RUN.md file that explains:
   - What was built
   - Prerequisites (Node.js version, etc.)
   - Installation steps (npm install, etc.)
   - How to run in development mode
   - How to build for production
   - File structure overview

Be concrete and specific. Base the guide on the actual files that exist.`;

  const writtenExtra: string[] = [];
  try {
    const pmSystemPrompt = 'You are a helpful project manager. Use write_file for each file you create. Always call write_file to create HOW_TO_RUN.md.';
    const finalMessages: ChatMessage[] = [{ role: 'user', content: finalizationPrompt }];

    // ── Agentic loop: handle tool calls from PM ──────────────────
    const FINALIZE_LOOP_LIMIT = 6;
    let lastTextContent = '';
    for (let loop = 0; loop < FINALIZE_LOOP_LIMIT; loop++) {
      let response: ExtendedChatResponse | Awaited<ReturnType<GatewayChatFn>>;
      try {
        response = await chatFn(
          pmAgent.provider,
          pmAgent.model,
          finalMessages,
          pmSystemPrompt,
          { tools: FILE_TOOLS, tool_choice: 'auto' },
        );
      } catch {
        // Provider doesn't support tools — fall back to plain text call
        response = await chatFn(pmAgent.provider, pmAgent.model, finalMessages, pmSystemPrompt);
      }

      if (response.content) lastTextContent = response.content;

      const toolUse = (response as ExtendedChatResponse).toolUse;
      if (toolUse && toolUse.length > 0) {
        // Execute all tool calls
        const toolResultBlocks: ContentBlock[] = [];
        for (const tool of toolUse) {
          const result = executeToolCall(tool.name, tool.input, targetPath, writtenExtra);
          toolResultBlocks.push({ type: 'tool_result', tool_use_id: tool.id, content: result });
        }
        // Add assistant + tool_result messages for next turn
        const assistantBlocks: ContentBlock[] = [];
        if (response.content) assistantBlocks.push({ type: 'text', text: response.content });
        for (const tool of toolUse) {
          assistantBlocks.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
        }
        finalMessages.push({ role: 'assistant', content: assistantBlocks });
        finalMessages.push({ role: 'user', content: toolResultBlocks });
      } else {
        // No more tool calls — PM is done
        break;
      }
    }

    // ── Ensure HOW_TO_RUN.md exists ──────────────────────────────
    const howToRunExists = allFiles.some((f) => /HOW_TO_RUN|README/i.test(f)) ||
      writtenExtra.some((f) => /HOW_TO_RUN|README/i.test(f));

    if (!howToRunExists) {
      if (lastTextContent.length > 50) {
        // Write PM's text response directly as HOW_TO_RUN.md
        writeFiles(targetPath, [{ path: 'HOW_TO_RUN.md', code: lastTextContent }]);
        writtenExtra.push('HOW_TO_RUN.md');
      } else {
        const fileList = [...allFiles, ...writtenExtra].join('\n  - ');
        const minimal = `# How to Run\n\nThis project was generated by MCT-MADEV.\n\n## Project Files\n\n  - ${fileList}\n\n## Getting Started\n\n1. Install dependencies: \`npm install\` or \`pnpm install\`\n2. Start development: \`npm run dev\` or \`pnpm dev\`\n3. Build: \`npm run build\` or \`pnpm build\`\n`;
        writeFiles(targetPath, [{ path: 'HOW_TO_RUN.md', code: minimal }]);
        writtenExtra.push('HOW_TO_RUN.md');
      }
    }

    const finalMsg = writtenExtra.length > 0
      ? `📋 PM 최종 검토 완료\n추가 파일: ${writtenExtra.join(', ')}\n\n프로젝트 실행 방법은 **HOW_TO_RUN.md**를 확인하세요.`
      : `📋 PM 최종 검토 완료 — 프로젝트 구조가 완성되었습니다.\n실행 가이드: **HOW_TO_RUN.md**`;

    broadcastChatStatus(wss, projectId, finalMsg, pmName, chatHistory);

    // Broadcast orchestration:complete event so UI can react without string parsing
    if (wss) {
      wss.broadcastToProject(projectId, {
        type: 'orchestration:complete' as never,
        timestamp: new Date().toISOString(),
        payload: { projectId },
      });
    }
  } finally {
    const pmIdle = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.IDLE });
    broadcastAgentUpdate(wss, pmAgent.projectId ?? projectId, pmIdle);
  }
}

/** Collect all files in the project directory (excluding node_modules, .git, dist, etc.) */
function collectProjectFiles(dir: string, rel = ''): string[] {
  const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', '.nuxt', '__pycache__', '.mct-madev']);
  const results: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return results; }

  for (const entry of entries) {
    if (IGNORE.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const relPath = rel ? `${rel}/${entry}` : entry;
    try {
      if (statSync(full).isDirectory()) {
        results.push(...collectProjectFiles(full, relPath));
      } else {
        results.push(relPath);
      }
    } catch { /* skip */ }
  }
  return results;
}

// ── Per-model context window limits (in tokens) ─────────────────────────────
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-6': 180_000,
  'claude-sonnet-4-6': 180_000,
  'claude-haiku-4-5-20251001': 180_000,
  'gpt-4o': 120_000,
  'gpt-4o-mini': 120_000,
  'gpt-4-turbo': 120_000,
  'gemini-2.5-pro': 900_000,
  'gemini-2.5-flash': 900_000,
  'gemini-1.5-pro': 900_000,
  'gemini-1.5-flash': 900_000,
};
const DEFAULT_CONTEXT_LIMIT = 100_000;

function getContextLimit(model?: string): number {
  if (!model) return DEFAULT_CONTEXT_LIMIT;
  // Try exact match first, then prefix match
  if (MODEL_CONTEXT_LIMITS[model]) return MODEL_CONTEXT_LIMITS[model];
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.startsWith(key) || key.startsWith(model)) return limit;
  }
  return DEFAULT_CONTEXT_LIMIT;
}

// ── Per-task timeout helper ──────────────────────────────────────────────────
const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per task

function withTaskTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Task timed out after ${TASK_TIMEOUT_MS / 60_000} minutes`)), TASK_TIMEOUT_MS),
    ),
  ]);
}

// ── Router ──
// Track active orchestrations per project (prevent concurrent runs)
const runningOrchestrations = new Set<string>();
// Last directive message per project (for retry)
const lastDirectives = new Map<string, string>();

const HISTORY_MAX_ENTRIES = 500;

export function createChatRouter(): Router {
  const router = Router();

  // Chat history per project (LRU: max 50 projects)
  const chatHistories = new Map<string, Array<{ role: string; content: string; sender?: string; timestamp: string }>>();
  function getOrCreateHistory(projectId: string) {
    if (chatHistories.has(projectId)) {
      // Promote to most-recently-used by re-inserting
      const existing = chatHistories.get(projectId)!;
      chatHistories.delete(projectId);
      chatHistories.set(projectId, existing);
      return existing;
    }
    if (chatHistories.size >= 50) {
      const lruKey = chatHistories.keys().next().value;
      if (lruKey) chatHistories.delete(lruKey);
    }
    const history: Array<{ role: string; content: string; sender?: string; timestamp: string }> = [];
    chatHistories.set(projectId, history);
    return history;
  }

  // POST /projects/:projectId/chat
  router.post('/projects/:projectId/chat', async (req: Request, res: Response) => {
    const projectId = param(req, 'projectId');
    let backgroundStarted = false; // tracks if background task owns the orchestration lock
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const chatFn = getChatFn(req);
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      if (!chatFn) {
        res.status(500).json({ error: 'Chat function not available.' });
        return;
      }

      // Prevent concurrent orchestrations for the same project
      if (runningOrchestrations.has(projectId)) {
        res.status(409).json({ error: 'ORCHESTRATION_RUNNING', message: '이미 실행 중인 오케스트레이션이 있습니다.' });
        return;
      }
      runningOrchestrations.add(projectId);

      const agents = await db.listAgents(projectId);
      const pmAgent = agents.find((a) => a.role === 'PM');
      if (!pmAgent) {
        res.status(400).json({ error: 'No PM agent found. Add a PM agent first.' });
        return;
      }

      // Get or create chat history (LRU-bounded)
      const history = getOrCreateHistory(projectId);

      // Add user message
      const userMsg = { role: 'user', content: message, sender: 'CEO', timestamp: new Date().toISOString() };
      history.push(userMsg);
      if (history.length > HISTORY_MAX_ENTRIES) history.splice(0, history.length - HISTORY_MAX_ENTRIES);

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
        lastDirectives.set(projectId, message);
        const pm = new PMAgent();
        const pmChatFn = async (msgs: ChatMessage[]) => {
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
            dependencies: sub.dependencies ?? [],
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

        // Execute asynchronously — background owns the orchestration lock
        backgroundStarted = true;
        const skillLoader = getSkillLoader(req);
        const project = await db.getProject(projectId);
        const repoPath = project?.repoPath;
        executeSubtasks(db, wss, projectId, chatFn, agents, createdSubtasks, skillLoader, pmAgent, history, repoPath)
          .catch((err) => {
            logger.error({ err: String(err), projectId }, 'Orchestration execution failed');
            if (wss) {
              wss.broadcastToProject(projectId, {
                type: 'orchestration:error' as never,
                timestamp: new Date().toISOString(),
                payload: { projectId, error: 'Orchestration failed unexpectedly. Check server logs.' },
              });
            }
          })
          .finally(() => { runningOrchestrations.delete(projectId); });
      }

      // PM back to idle
      const pmIdle = await db.updateAgent(pmAgent.id, { visualState: AgentVisualState.IDLE });
      broadcastAgentUpdate(wss, projectId, pmIdle);

      // Save assistant message
      const assistantMsg = { role: 'assistant', content: responseContent, sender: pmAgent.name, timestamp: new Date().toISOString() };
      history.push(assistantMsg);
      if (history.length > HISTORY_MAX_ENTRIES) history.splice(0, history.length - HISTORY_MAX_ENTRIES);

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
      const detail = String(err);
      // Provide a human-readable hint for common errors
      let hint = '';
      if (/401|unauthorized|invalid.*api.*key|api.*key.*invalid/i.test(detail)) {
        hint = ' (API 키가 유효하지 않습니다. .env를 확인하고 서버를 재시작하세요.)';
      } else if (/no.*provider|provider.*not.*found|not.*registered/i.test(detail)) {
        hint = ' (AI 프로바이더가 설정되지 않았습니다. .env에 API 키를 추가하세요.)';
      } else if (/econnrefused|network|fetch/i.test(detail)) {
        hint = ' (네트워크 오류. Ollama나 외부 API 서버를 확인하세요.)';
      }
      res.status(500).json({ error: `Chat failed${hint}`, detail });
    } finally {
      // Only release the lock here if background execution didn't take ownership
      if (!backgroundStarted) runningOrchestrations.delete(projectId);
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

  // POST /projects/:projectId/chat/retry — re-run last failed directive
  router.post('/projects/:projectId/chat/retry', async (req: Request, res: Response) => {
    const projectId = param(req, 'projectId');
    const lastMessage = lastDirectives.get(projectId);
    if (!lastMessage) {
      res.status(404).json({ error: 'No previous directive to retry' });
      return;
    }
    if (runningOrchestrations.has(projectId)) {
      res.status(409).json({ error: 'ORCHESTRATION_RUNNING', message: '이미 실행 중인 오케스트레이션이 있습니다.' });
      return;
    }
    try {
      const db = getDb(req);
      const wss = getWss(req);
      const chatFn = getChatFn(req);
      if (!chatFn) { res.status(500).json({ error: 'Chat function not available.' }); return; }

      const agents = await db.listAgents(projectId);
      const pmAgent = agents.find((a) => a.role === 'PM');
      if (!pmAgent) { res.status(400).json({ error: 'No PM agent found.' }); return; }

      runningOrchestrations.add(projectId);

      const history = getOrCreateHistory(projectId);
      const userMsg = { role: 'user', content: `[재시도] ${lastMessage}`, sender: 'CEO', timestamp: new Date().toISOString() };
      history.push(userMsg);
      if (history.length > HISTORY_MAX_ENTRIES) history.splice(0, history.length - HISTORY_MAX_ENTRIES);

      const pm = new PMAgent();
      const pmChatFn = async (msgs: ChatMessage[]) => {
        const result = await chatFn(pmAgent.provider, pmAgent.model, msgs as never, pmAgent.systemPrompt);
        return result as import('@mct-madev/core').ChatResponse;
      };

      const rootTask = await db.createTask({
        projectId, title: `[재시도] ${lastMessage.slice(0, 80)}`, description: lastMessage,
        status: TaskStatus.CREATED, assigneeAgentId: pmAgent.id, priority: 10,
        dependencies: [], metadata: { type: 'directive', retry: true },
      });

      let subtaskDefs;
      try {
        subtaskDefs = await pm.decompose(rootTask as never, pmChatFn, agents.map((a) => ({ name: a.name, role: a.role, id: a.id })));
      } catch (err) {
        runningOrchestrations.delete(projectId);
        await db.updateTask(rootTask.id, { status: TaskStatus.DONE, result: `Decompose failed: ${err}` });
        res.status(500).json({ error: '재시도 계획 수립 실패', detail: String(err) });
        return;
      }

      await db.updateTask(rootTask.id, { status: TaskStatus.DONE, result: JSON.stringify(subtaskDefs) });
      const assignments = assignSubtasks(agents, subtaskDefs);
      const createdSubtasks = [];
      for (let i = 0; i < subtaskDefs.length; i++) {
        const sub = subtaskDefs[i];
        let assignee = assignments.get(i);
        if (!assignee) {
          assignee = await ensureAgentForRole(db, wss, projectId, detectNeededRole(sub), agents);
          agents.push(assignee);
        }
        const subtask = await db.createTask({
          projectId, parentTaskId: rootTask.id, title: sub.title, description: sub.description,
          status: TaskStatus.CREATED, assigneeAgentId: assignee?.id, priority: sub.priority,
          dependencies: sub.dependencies ?? [], metadata: { parentDirective: rootTask.id },
        });
        broadcastTaskUpdate(wss, projectId, subtask);
        createdSubtasks.push({ ...subtask, assigneeName: assignee?.name });
      }

      res.status(202).json({ message: '재시도 오케스트레이션이 시작되었습니다.', subtasks: createdSubtasks.length });

      const skillLoader = getSkillLoader(req);
      const project = await db.getProject(projectId);
      executeSubtasks(db, wss, projectId, chatFn, agents, createdSubtasks, skillLoader, pmAgent, history, project?.repoPath)
        .catch((err) => {
          logger.error({ err: String(err), projectId }, 'Retry orchestration failed');
          if (wss) wss.broadcastToProject(projectId, { type: 'orchestration:error' as never, timestamp: new Date().toISOString(), payload: { projectId, error: 'Retry failed. Check server logs.' } });
        })
        .finally(() => { runningOrchestrations.delete(projectId); });
    } catch (err) {
      runningOrchestrations.delete(projectId);
      res.status(500).json({ error: 'Retry failed', detail: String(err) });
    }
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
