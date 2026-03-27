import type { Task } from '../types/task.js';
import type { ChatMessage, ChatResponse } from '../types/model.js';
import { TaskStatus } from '../types/task.js';

export type ChatFn = (messages: ChatMessage[]) => Promise<ChatResponse>;

export interface SubtaskDef {
  title: string;
  description: string;
  assignee?: string;
  dependencies: string[];
  priority: number;
  metadata: Record<string, unknown>;
}

export interface ProjectStatusReport {
  projectId: string;
  workflowName: string;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignee?: string;
    result?: string;
    error?: string;
  }>;
  completedCount: number;
  totalCount: number;
}

/**
 * PM Agent that decomposes high-level tasks into subtasks,
 * reviews completed work, and generates status reports.
 *
 * It uses an injected chat function to interact with the LLM,
 * keeping the core package free from direct model provider dependencies.
 */
export class PMAgent {
  /**
   * Decompose a high-level task into subtasks using the LLM.
   * @param agents - Optional list of available agents so PM can assign by name
   */
  async decompose(
    task: Task,
    chatFn: ChatFn,
    agents?: Array<{ name: string; role: string; id: string }>,
  ): Promise<SubtaskDef[]> {
    const agentInfo = agents && agents.length > 0
      ? `\n\nAvailable team members:\n${agents
          .filter((a) => a.role !== 'PM')
          .map((a) => `- ${a.name} (role: ${a.role}, id: ${a.id})`)
          .join('\n')}\n\nAssign each subtask to the most appropriate team member by setting "assignee" to their exact name.`
      : '';

    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a PM agent responsible for breaking down software development tasks into concrete, implementable subtasks.
You must respond with a JSON array of subtask objects, each having:
- title (string)
- description (string) — detailed enough for a developer to implement without further clarification
- assignee (string, name of the team member to assign this to)
- dependencies (string array of subtask titles that must be done first)
- priority (number 1-10, higher = more important)
${agentInfo}

IMPORTANT RULES:
1. Choose the RIGHT project type based on complexity. Use the project description and context to judge — do NOT rely on file names alone:

   A. SIMPLE (single-page app, CLI tool, simple script, landing page, utility library):
      → Small scope, single entry point, minimal dependencies.
      → Examples by stack:
        - Web: a single self-contained HTML file OR a simple script
        - Python: main.py + requirements.txt (if any)
        - Go: main.go + go.mod
        - Rust: main.rs + Cargo.toml
        - Node: index.js/ts + package.json
      → Include a "Implement [main entry point]" subtask (priority 10) that creates one complete, runnable artifact.

   B. MEDIUM (REST API server, full-stack web app with database, mobile app, multi-module library):
      → Multiple components, a data layer, or client-server split.
      → Examples by stack:
        - Web: HTML/CSS/JS multi-page OR React app without complex state
        - Python: FastAPI/Flask app with models and routes
        - Go: HTTP server with handlers and middleware
        - Rust: Binary crate with multiple modules
        - Node: Express API with routes and a database
      → Break into Setup, Core Logic, and Integration subtasks.

   C. COMPLEX (microservices, distributed system, real-time platform, ML pipeline, monorepo):
      → Multiple services, inter-process communication, or significant infrastructure.
      → Examples by stack:
        - Any language: event-driven architecture, message queues, orchestration
        - Python: ML training pipeline, data ingestion + model serving
        - Go/Rust: high-performance networked services
        - Node/TypeScript: full-stack monorepo with CI/CD
      → Include a "Project Setup & Architecture" subtask (priority 10) that defines the directory structure, config files, and inter-service contracts.

2. Each subtask description must specify EXACTLY which files to create AND include the COMPLETE content (not just a description).
3. Break implementation into small, focused tasks — one concern per task.
4. Distribute work evenly across available team members based on their role.

Respond ONLY with the JSON array, no markdown fences, no explanation.`,
    };

    const userMessage: ChatMessage = {
      role: 'user',
      content: `Break down this task into subtasks:

Title: ${task.title}
Description: ${task.description}
${task.metadata ? `Context: ${JSON.stringify(task.metadata)}` : ''}`,
    };

    const response = await chatFn([systemMessage, userMessage]);
    return this.parseSubtasks(response.content);
  }

  /**
   * Review completed work on a task.
   * Returns { approved: boolean, feedback: string }.
   */
  async review(
    task: Task,
    result: string,
    chatFn: ChatFn,
  ): Promise<{ approved: boolean; feedback: string }> {
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a PM agent reviewing completed work.
Evaluate if the work meets the requirements described in the task.
Respond with JSON: { "approved": true/false, "feedback": "your feedback" }
Respond ONLY with JSON, no markdown fences, no explanation.`,
    };

    const userMessage: ChatMessage = {
      role: 'user',
      content: `Review this completed task:

Task Title: ${task.title}
Task Description: ${task.description}

Result:
${result}`,
    };

    const response = await chatFn([systemMessage, userMessage]);
    try {
      const parsed = JSON.parse(response.content);
      return {
        approved: Boolean(parsed.approved),
        feedback: String(parsed.feedback ?? ''),
      };
    } catch {
      // If parsing fails, treat as needing revision
      return {
        approved: false,
        feedback: `Failed to parse review response. Raw: ${response.content}`,
      };
    }
  }

  /**
   * Generate a status report for the project.
   */
  report(projectStatus: ProjectStatusReport): string {
    const { projectId, workflowName, tasks, completedCount, totalCount } = projectStatus;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const lines: string[] = [
      `# Project Status Report`,
      ``,
      `**Project:** ${projectId}`,
      `**Workflow:** ${workflowName}`,
      `**Progress:** ${completedCount}/${totalCount} tasks (${pct}%)`,
      ``,
      `## Tasks`,
      ``,
    ];

    for (const t of tasks) {
      const statusIcon = t.status === TaskStatus.DONE ? '[DONE]' : `[${t.status}]`;
      let line = `- ${statusIcon} **${t.title}**`;
      if (t.assignee) line += ` (assigned: ${t.assignee})`;
      if (t.error) line += ` - ERROR: ${t.error}`;
      lines.push(line);
    }

    return lines.join('\n');
  }

  private parseSubtasks(content: string): SubtaskDef[] {
    // Try to extract JSON from the response (handle possible markdown fences)
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array of subtasks');
    }

    const subtasks = parsed.map(
      (item: Record<string, unknown>): SubtaskDef => ({
        title: String(item.title ?? ''),
        description: String(item.description ?? ''),
        assignee: typeof item.assignee === 'string' ? item.assignee : undefined,
        dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String) : [],
        priority: typeof item.priority === 'number' ? item.priority : 5,
        metadata: typeof item.metadata === 'object' && item.metadata ? (item.metadata as Record<string, unknown>) : {},
      }),
    );

    // Validate dependency references
    const titles = new Set(subtasks.map(t => t.title));
    for (const task of subtasks) {
      if (task.dependencies) {
        task.dependencies = task.dependencies.filter(dep => {
          const valid = titles.has(dep);
          if (!valid) {
            console.warn(`[PMAgent] Removing unknown dependency "${dep}" from task "${task.title}"`);
          }
          return valid;
        });
      }
    }

    return subtasks;
  }
}
