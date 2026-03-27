import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse, ToolUseBlock, ContentBlock } from '@mct-madev/core';
import { ModelProvider } from '@mct-madev/core';
import type { IProvider } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

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
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string'
          ? m.content
          : (m.content as ContentBlock[]).map((b) => {
              if (b.type === 'text') return { type: 'text', text: b.text };
              if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
              if (b.type === 'tool_result') return { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content, ...(b.is_error ? { is_error: true } : {}) };
              return b as Record<string, unknown>;
            }),
      }));

    const body: Record<string, unknown> = {
      model: config.model,
      messages: nonSystemMessages,
      max_tokens: config.maxTokens ?? 4096,
    };

    if (systemMessage) {
      body.system = typeof systemMessage.content === 'string' ? systemMessage.content : '';
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

    const shouldStream = typeof options?.onChunk === 'function';
    if (shouldStream) body.stream = true;

    const baseUrl = config.baseUrl ?? this.baseUrl;
    const response = await fetchWithRetry(`${baseUrl}/v1/messages`, {
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
      const safeError = errorText.slice(0, 500).replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
      throw new Error(`Anthropic API error (${response.status}): ${safeError}`);
    }

    // ── Streaming path ────────────────────────────────────────────────
    if (shouldStream && response.body) {
      const onChunk = options!.onChunk!;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      let accText = '';
      let responseModel = config.model;
      let stopReason = 'end_turn';
      let inputTokens = 0;
      let outputTokens = 0;
      const toolParts: Array<{ id: string; name: string; inputJson: string }> = [];
      let currentToolIdx = -1;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json || json === '[DONE]') continue;
            try {
              const evt = JSON.parse(json) as Record<string, unknown>;
              if (evt.type === 'message_start') {
                const msg = evt.message as Record<string, unknown>;
                responseModel = (msg.model as string) ?? responseModel;
                const u = msg.usage as Record<string, number> | undefined;
                if (u) { inputTokens = u.input_tokens ?? 0; outputTokens = u.output_tokens ?? 0; }
              } else if (evt.type === 'content_block_start') {
                const cb = evt.content_block as Record<string, unknown>;
                if (cb.type === 'tool_use') {
                  currentToolIdx = toolParts.length;
                  toolParts.push({ id: cb.id as string, name: cb.name as string, inputJson: '' });
                }
              } else if (evt.type === 'content_block_delta') {
                const delta = evt.delta as Record<string, unknown>;
                if (delta.type === 'text_delta') {
                  const chunk = delta.text as string;
                  accText += chunk;
                  onChunk(chunk);
                } else if (delta.type === 'input_json_delta' && currentToolIdx >= 0) {
                  toolParts[currentToolIdx].inputJson += (delta.partial_json as string) ?? '';
                }
              } else if (evt.type === 'message_delta') {
                const d = evt.delta as Record<string, unknown>;
                stopReason = (d.stop_reason as string) ?? stopReason;
                const u = evt.usage as Record<string, number> | undefined;
                if (u?.output_tokens) outputTokens = u.output_tokens;
              }
            } catch { /* ignore malformed SSE lines */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const toolUseBlocks: ToolUseBlock[] = toolParts.map((t) => ({
        type: 'tool_use' as const,
        id: t.id,
        name: t.name,
        input: t.inputJson ? (JSON.parse(t.inputJson) as Record<string, unknown>) : {},
      }));

      const streamBase = {
        content: accText,
        model: responseModel,
        provider: ModelProvider.ANTHROPIC,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        finishReason: stopReason,
      };
      if (toolUseBlocks.length > 0) return { ...streamBase, toolUse: toolUseBlocks } as ExtendedChatResponse;
      return streamBase;
    }

    // ── Non-streaming path ────────────────────────────────────────────
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
