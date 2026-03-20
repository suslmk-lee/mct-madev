import { ModelProvider } from '@mct-madev/core';
import { OpenAICompatibleProvider } from './openai-compatible.js';

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas';

export class GLMProvider extends OpenAICompatibleProvider {
  readonly name = 'GLM (Zhipu)';
  readonly provider = ModelProvider.GLM;

  constructor(apiKey?: string, baseUrl?: string) {
    super(ModelProvider.GLM, DEFAULT_BASE_URL, 'GLM_API_KEY', apiKey, baseUrl);
  }

  protected override getChatEndpoint(baseUrl: string): string {
    return `${baseUrl}/v4/chat/completions`;
  }
}
