export interface Message {
  id: string;
  taskId: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount?: number;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  projectId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TokenUsageInput {
  projectId: string;
  agentId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: Record<string, { input: number; output: number }>;
  byAgent: Record<string, { input: number; output: number }>;
}

export interface TaskFilter {
  status?: string;
  assigneeAgentId?: string;
  workflowId?: string;
}

export type MessageInput = Omit<Message, 'id' | 'createdAt'>;
export type LogInput = Omit<LogEntry, 'id' | 'createdAt'>;
