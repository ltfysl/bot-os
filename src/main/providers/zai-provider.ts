import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface ZaiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class ZaiProvider implements AgentProvider {
  readonly id = 'zai';
  readonly name = 'Z.ai';

  private config: ZaiConfig;

  constructor(config: ZaiConfig = {}) {
    this.config = {
      model: config.model || 'glm-5.3',
      baseUrl: config.baseUrl || 'https://api.z.ai/api/paas/v4/chat/completions',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('zai', 'apiKey');

    if (!apiKey) {
      throw new Error('Z.ai credentials not configured');
    }

    try {
      const response = await fetch(this.config.baseUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: message }],
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`Z.ai API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || 'No response';
    } catch (error) {
      throw new Error(`Z.ai provider error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('zai', 'apiKey');
    return Boolean(apiKey);
  }
}
