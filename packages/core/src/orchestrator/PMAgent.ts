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

export interface ProjectStatus {
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
      content: `You are a PM agent responsible for breaking down tasks into subtasks.
You must respond with a JSON array of subtask objects, each having:
- title (string)
- description (string)
- assignee (string, name of the team member to assign this to)
- dependencies (string array of subtask titles that must be done first)
- priority (number 1-10, higher = more important)
${agentInfo}

Distribute work evenly across available team members based on their role and expertise.
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
  report(projectStatus: ProjectStatus): string {
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

    return parsed.map(
      (item: Record<string, unknown>): SubtaskDef => ({
        title: String(item.title ?? ''),
        description: String(item.description ?? ''),
        assignee: typeof item.assignee === 'string' ? item.assignee : undefined,
        dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String) : [],
        priority: typeof item.priority === 'number' ? item.priority : 5,
        metadata: typeof item.metadata === 'object' && item.metadata ? (item.metadata as Record<string, unknown>) : {},
      }),
    );
  }
}
