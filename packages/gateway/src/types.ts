import type { ChatMessage, ChatResponse, ModelConfig, ChatOptions, ExtendedChatResponse } from '@mct-madev/core';

export interface IProvider {
  readonly name: string;
  readonly provider: string;
  chat(messages: ChatMessage[], config: ModelConfig, options?: ChatOptions): Promise<ChatResponse | ExtendedChatResponse>;
  isHealthy(): Promise<boolean>;
}
