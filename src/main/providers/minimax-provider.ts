import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface MiniMaxConfig {
  apiKey?: string;
  groupId?: string;
  model?: string;
  baseUrl?: string;
}

export class MiniMaxProvider implements AgentProvider {
  readonly id = 'minimax';
  readonly name = 'MiniMax';

  private config: MiniMaxConfig;

  constructor(config: MiniMaxConfig = {}) {
    this.config = {
      model: config.model || 'abab6.5s-chat',
      baseUrl: config.baseUrl || 'https://api.minimax.chat/v1/text/chatcompletion_v2',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('minimax', 'apiKey');
    const groupId = this.config.groupId || getProviderSecret('minimax', 'groupId');

    if (!apiKey || !groupId) {
      throw new Error('MiniMax credentials not configured');
    }

    try {
      const response = await fetch(`${this.config.baseUrl}?GroupId=${groupId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: message }],
          tokens_to_generate: 1024,
          temperature: 0.7,
          ...context,
        }),
      });

      if (!response.ok) {
        throw new Error(`MiniMax API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || 'No response';
    } catch (error) {
      throw new Error(`MiniMax provider error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('minimax', 'apiKey');
    const groupId = this.config.groupId || getProviderSecret('minimax', 'groupId');
    return Boolean(apiKey && groupId);
  }
}
