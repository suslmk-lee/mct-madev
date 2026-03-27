import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse, ToolUseBlock, ContentBlock } from '@mct-madev/core';
import { ModelProvider } from '@mct-madev/core';
import type { IProvider } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
  timeoutMs = 120_000,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(1000 * 2 ** attempt);
      }
    }
  }
  throw lastErr ?? new Error('fetchWithRetry: max retries exceeded');
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
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

    // Convert ChatMessage[] to OpenAI message format, expanding tool_result blocks
    const openaiMessages: OpenAIMessage[] = [];
    for (const m of messages) {
      if (typeof m.content === 'string') {
        openaiMessages.push({ role: m.role, content: m.content });
        continue;
      }
      const blocks = m.content as ContentBlock[];
      // user message with tool_result blocks → one 'tool' message per result
      if (m.role === 'user' && blocks.every((b) => b.type === 'tool_result')) {
        for (const b of blocks) {
          if (b.type === 'tool_result') {
            openaiMessages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content });
          }
        }
        continue;
      }
      // assistant message with tool_use blocks
      if (m.role === 'assistant') {
        const textParts = blocks.filter((b) => b.type === 'text').map((b) => (b as { type: 'text'; text: string }).text).join('');
        const toolUseParts = blocks.filter((b) => b.type === 'tool_use') as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;
        const msg: OpenAIMessage = { role: 'assistant', content: textParts || null };
        if (toolUseParts.length > 0) {
          msg.tool_calls = toolUseParts.map((b) => ({
            id: b.id,
            type: 'function' as const,
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));
        }
        openaiMessages.push(msg);
        continue;
      }
      // fallback: stringify content
      openaiMessages.push({ role: m.role, content: blocks.filter((b) => b.type === 'text').map((b) => (b as { type: 'text'; text: string }).text).join('') });
    }

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
    const response = await fetchWithRetry(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const safeError = errorText.slice(0, 500).replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
      throw new Error(`OpenAI API error (${response.status}): ${safeError}`);
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
