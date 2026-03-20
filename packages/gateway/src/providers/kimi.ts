import { ModelProvider } from '@mct-madev/core';
import { OpenAICompatibleProvider } from './openai-compatible.js';

const DEFAULT_BASE_URL = 'https://api.moonshot.cn';

export class KimiProvider extends OpenAICompatibleProvider {
  readonly name = 'Kimi (Moonshot)';
  readonly provider = ModelProvider.KIMI;

  constructor(apiKey?: string, baseUrl?: string) {
    super(ModelProvider.KIMI, DEFAULT_BASE_URL, 'KIMI_API_KEY', apiKey, baseUrl);
  }
}
