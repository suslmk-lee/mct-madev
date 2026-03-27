export const ModelProvider = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  OLLAMA: 'ollama',
  KIMI: 'kimi',
  MINIMAX: 'minimax',
  GLM: 'glm',
} as const;

export type ModelProvider = (typeof ModelProvider)[keyof typeof ModelProvider];

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Content block types used for multi-turn tool use conversations */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  /** String for simple messages; ContentBlock[] for tool-use turns */
  content: string | ContentBlock[];
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}
