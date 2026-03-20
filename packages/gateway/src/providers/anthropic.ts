import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse, ToolUseBlock } from '@mct-madev/core';
import { ModelProvider } from '@mct-madev/core';
import type { IProvider } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider implements IProvider {
  readonly name = 'Anthropic';
  readonly provider = ModelProvider.ANTHROPIC;

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  async chat(messages: ChatMessage[], config: ModelConfig, options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse> {
    const apiKey = config.apiKey ?? this.apiKey;
    if (!apiKey) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY or pass apiKey in config.');
    }

    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages: AnthropicMessage[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body: Record<string, unknown> = {
      model: config.model,
      messages: nonSystemMessages,
      max_tokens: config.maxTokens ?? 4096,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
      if (options.tool_choice) {
        body.tool_choice = typeof options.tool_choice === 'string'
          ? { type: options.tool_choice }
          : options.tool_choice;
      }
    }

    const baseUrl = config.baseUrl ?? this.baseUrl;
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    const textContent = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    const toolUseBlocks: ToolUseBlock[] = data.content
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        type: 'tool_use' as const,
        id: block.id!,
        name: block.name!,
        input: block.input ?? {},
      }));

    const baseResponse = {
      content: textContent,
      model: data.model,
      provider: ModelProvider.ANTHROPIC,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: data.stop_reason ?? 'unknown',
    };

    if (toolUseBlocks.length > 0) {
      return { ...baseResponse, toolUse: toolUseBlocks } as ExtendedChatResponse;
    }

    return baseResponse;
  }

  async isHealthy(): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
