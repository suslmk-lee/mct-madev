import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse, ToolUseBlock } from '@mct-madev/core';
import { ModelProvider } from '@mct-madev/core';
import type { IProvider } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider implements IProvider {
  readonly name = 'OpenAI';
  readonly provider = ModelProvider.OPENAI;

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  async chat(messages: ChatMessage[], config: ModelConfig, options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse> {
    const apiKey = config.apiKey ?? this.apiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY or pass apiKey in config.');
    }

    const openaiMessages: OpenAIMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: config.model,
      messages: openaiMessages,
    };

    if (config.maxTokens !== undefined) {
      body.max_tokens = config.maxTokens;
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }

    // Convert Anthropic-style tools to OpenAI function calling format
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
      if (options.tool_choice) {
        if (typeof options.tool_choice === 'string') {
          body.tool_choice = options.tool_choice;
        } else {
          body.tool_choice = { type: 'function', function: { name: options.tool_choice.name } };
        }
      }
    }

    const baseUrl = config.baseUrl ?? this.baseUrl;
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('OpenAI returned no choices in the response.');
    }

    const baseResponse = {
      content: choice.message.content ?? '',
      model: data.model,
      provider: ModelProvider.OPENAI,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      finishReason: choice.finish_reason ?? 'unknown',
    };

    // Convert OpenAI tool_calls to Anthropic-style ToolUseBlocks
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolUseBlocks: ToolUseBlock[] = choice.message.tool_calls.map((tc) => ({
        type: 'tool_use' as const,
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      }));
      return { ...baseResponse, toolUse: toolUseBlocks } as ExtendedChatResponse;
    }

    return baseResponse;
  }

  async isHealthy(): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
