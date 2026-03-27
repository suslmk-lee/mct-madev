import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse, ToolUseBlock } from '@mct-madev/core';
import { ModelProvider } from '@mct-madev/core';
import type { IProvider } from '../types.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }>; role: string };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion: string;
}

export class GoogleProvider implements IProvider {
  readonly name = 'Google Gemini';
  readonly provider = ModelProvider.GOOGLE;

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.GOOGLE_API_KEY ?? '';
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  async chat(messages: ChatMessage[], config: ModelConfig, options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse> {
    const apiKey = config.apiKey ?? this.apiKey;
    if (!apiKey) {
      throw new Error('Google API key is required. Set GOOGLE_API_KEY or pass apiKey in config.');
    }

    const systemInstruction = messages.find((m) => m.role === 'system');
    const contents: GeminiContent[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));

    const body: Record<string, unknown> = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: typeof systemInstruction.content === 'string' ? systemInstruction.content : '' }] };
    }

    const generationConfig: Record<string, unknown> = {};
    if (config.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = config.maxTokens;
    }
    if (config.temperature !== undefined) {
      generationConfig.temperature = config.temperature;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // Convert tools to Gemini format
    if (options?.tools && options.tools.length > 0) {
      body.tools = [{
        functionDeclarations: options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        })),
      }];
    }

    const baseUrl = config.baseUrl ?? this.baseUrl;
    const model = config.model;
    const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const safeError = errorText.slice(0, 500).replace(/AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
      throw new Error(`Google Gemini API error (${response.status}): ${safeError}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];

    if (!candidate) {
      throw new Error('Google Gemini returned no candidates in the response.');
    }

    const content = candidate.content.parts.map((p) => p.text).join('');

    return {
      content,
      model: data.modelVersion ?? config.model,
      provider: ModelProvider.GOOGLE,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      finishReason: candidate.finishReason ?? 'unknown',
    };
  }

  async isHealthy(): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) return false;

    try {
      const response = await fetch(
        `${this.baseUrl}/v1beta/models?key=${apiKey}&pageSize=1`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
