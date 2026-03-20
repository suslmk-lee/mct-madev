import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse, ToolUseBlock } from '@mct-madev/core';
import { ModelProvider } from '@mct-madev/core';
import type { IProvider } from '../types.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaResponse {
  model: string;
  message: { role: string; content: string; tool_calls?: OllamaToolCall[] };
  done: boolean;
  done_reason: string;
  total_duration: number;
  prompt_eval_count: number;
  eval_count: number;
}

export class OllamaProvider implements IProvider {
  readonly name = 'Ollama';
  readonly provider = ModelProvider.OLLAMA;

  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async chat(messages: ChatMessage[], config: ModelConfig, options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse> {
    const ollamaMessages: OllamaMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: config.model,
      messages: ollamaMessages,
      stream: false,
    };

    const opts: Record<string, unknown> = {};
    if (config.maxTokens !== undefined) {
      opts.num_predict = config.maxTokens;
    }
    if (config.temperature !== undefined) {
      opts.temperature = config.temperature;
    }
    if (Object.keys(opts).length > 0) {
      body.options = opts;
    }

    // Ollama tools format (OpenAI-compatible)
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    const baseUrl = config.baseUrl ?? this.baseUrl;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OllamaResponse;

    const baseResponse = {
      content: data.message.content ?? '',
      model: data.model,
      provider: ModelProvider.OLLAMA,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done_reason ?? (data.done ? 'stop' : 'unknown'),
    };

    // Convert Ollama tool_calls to ToolUseBlocks
    if (data.message.tool_calls && data.message.tool_calls.length > 0) {
      const toolUseBlocks: ToolUseBlock[] = data.message.tool_calls.map((tc, i) => ({
        type: 'tool_use' as const,
        id: `ollama_tool_${i}_${Date.now()}`,
        name: tc.function.name,
        input: tc.function.arguments,
      }));
      return { ...baseResponse, toolUse: toolUseBlocks } as ExtendedChatResponse;
    }

    return baseResponse;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
