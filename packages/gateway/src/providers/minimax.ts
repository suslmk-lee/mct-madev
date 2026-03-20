import { ModelProvider } from '@mct-madev/core';
import { OpenAICompatibleProvider } from './openai-compatible.js';

const DEFAULT_BASE_URL = 'https://api.minimax.chat';

export class MiniMaxProvider extends OpenAICompatibleProvider {
  readonly name = 'MiniMax';
  readonly provider = ModelProvider.MINIMAX;

  constructor(apiKey?: string, baseUrl?: string) {
    super(ModelProvider.MINIMAX, DEFAULT_BASE_URL, 'MINIMAX_API_KEY', apiKey, baseUrl);
  }

  protected override getChatEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/text/chatcompletion_v2`;
  }
}
