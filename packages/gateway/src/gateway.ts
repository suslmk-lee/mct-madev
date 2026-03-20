import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse } from '@mct-madev/core';
import type { IProvider } from './types.js';

export class ModelGateway {
  private providers = new Map<string, IProvider>();

  registerProvider(provider: IProvider): void {
    this.providers.set(provider.provider, provider);
  }

  async chat(messages: ChatMessage[], config: ModelConfig, options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse> {
    const provider = this.providers.get(config.provider);
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(
        `Provider "${config.provider}" is not registered. Available providers: ${available || 'none'}`,
      );
    }
    return provider.chat(messages, config, options);
  }

  async isHealthy(providerName: string): Promise<boolean> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return false;
    }
    return provider.isHealthy();
  }

  listProviders(): Array<{ name: string; provider: string }> {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      provider: p.provider,
    }));
  }
}
