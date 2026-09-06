import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id?: string;
  type?: string;
  role?: string;
  content?: Array<{
    type: string;
    text?: string;
  }>;
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
}

export class AnthropicProvider implements AgentProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';

  private config: AnthropicConfig;

  constructor(config: AnthropicConfig = {}) {
    this.config = {
      model: config.model || 'claude-sonnet-4-20250514',
      baseUrl: config.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('anthropic', 'apiKey');

    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('Anthropic base URL not configured');
    }

    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: message,
      },
    ];

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as AnthropicResponse;

      if (data.error) {
        throw new Error(`Anthropic service error: ${data.error.message || 'Unknown service error'}`);
      }

      const content = data.content?.[0]?.text;
      if (!content) {
        throw new Error('Anthropic returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Anthropic provider: unexpected error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('anthropic', 'apiKey');
    return Boolean(apiKey);
  }
}
