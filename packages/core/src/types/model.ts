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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
