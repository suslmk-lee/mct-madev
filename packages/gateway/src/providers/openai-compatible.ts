import type { ChatMessage, ChatResponse, ModelConfig, ModelProvider, ChatOptions, ExtendedChatResponse } from '@mct-madev/core';
import type { IProvider } from '../types.js';

interface OpenAICompatibleMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAICompatibleResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

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

export abstract class OpenAICompatibleProvider implements IProvider {
  abstract readonly name: string;
  abstract readonly provider: string;

  protected apiKey: string;
  protected baseUrl: string;
  protected envKeyName: string;

  constructor(
    providerType: ModelProvider,
    baseUrl: string,
    envKeyName: string,
    apiKey?: string,
    baseUrlOverride?: string,
  ) {
    this.envKeyName = envKeyName;
    this.apiKey = apiKey ?? process.env[envKeyName] ?? '';
    this.baseUrl = baseUrlOverride ?? baseUrl;
  }

  async chat(messages: ChatMessage[], config: ModelConfig, _options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse> {
    const apiKey = config.apiKey ?? this.apiKey;
    if (!apiKey) {
      throw new Error(
        `${this.name} API key is required. Set ${this.envKeyName} or pass apiKey in config.`,
      );
    }

    const chatMessages: OpenAICompatibleMessage[] = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const body: Record<string, unknown> = {
      model: config.model,
      messages: chatMessages,
    };

    if (config.maxTokens !== undefined) {
      body.max_tokens = config.maxTokens;
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }

    const baseUrl = config.baseUrl ?? this.baseUrl;
    const endpoint = this.getChatEndpoint(baseUrl);

    const response = await fetchWithRetry(endpoint, {
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
      throw new Error(`${this.name} API error (${response.status}): ${safeError}`);
    }

    const data = (await response.json()) as OpenAICompatibleResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error(`${this.name} returned no choices in the response.`);
    }

    return {
      content: choice.message.content ?? '',
      model: data.model,
      provider: config.provider,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason: choice.finish_reason ?? 'unknown',
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  protected getChatEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/chat/completions`;
  }
}
