/**
 * Skill definitions following Anthropic's tool use standard.
 * Skills are stored as JSON files in `.madev/agents/skills/`.
 */

/** Anthropic-standard tool input schema (JSON Schema subset) */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
    default?: unknown;
  }>;
  required?: string[];
}

/** A single skill/tool definition (Anthropic tool format) */
export interface SkillDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  /** Optional: which agent roles can use this skill */
  roles?: string[];
  /** Optional: keywords for auto-matching to tasks */
  keywords?: string[];
  /** Optional: execution handler type */
  handler?: 'llm' | 'script' | 'api';
  /** Optional: handler configuration */
  handler_config?: Record<string, unknown>;
}

/** Loaded skill with file metadata */
export interface LoadedSkill {
  definition: SkillDefinition;
  filePath: string;
  fileName: string;
}

/** Tool call from LLM response */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool result to send back to LLM */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Extended chat message that can contain tool use/results */
export interface ExtendedChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<ToolUseBlock | ToolResultBlock | { type: 'text'; text: string }>;
}

/** Chat options for tool-enabled requests */
export interface ChatOptions {
  tools?: SkillDefinition[];
  tool_choice?: 'auto' | 'any' | { type: 'tool'; name: string };
}

/** Extended chat response that may include tool calls */
export interface ExtendedChatResponse {
  content: string;
  model: string;
  provider: string; // ModelProvider or string
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  /** Tool use blocks if LLM requested tool calls */
  toolUse?: ToolUseBlock[];
}

/** Guidelines loaded from madev.md */
export interface Guidelines {
  content: string;
  filePath: string;
}
