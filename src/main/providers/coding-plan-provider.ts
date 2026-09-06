import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface CodingPlanConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface CodingPlanMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CodingPlanResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
  };
}

export class CodingPlanProvider implements AgentProvider {
  readonly id = 'coding-plan';
  readonly name = 'Coding Plan';

  private config: CodingPlanConfig;

  constructor(config: CodingPlanConfig = {}) {
    this.config = {
      model: config.model || 'gpt-4',
      baseUrl:
        config.baseUrl ||
        process.env.CODING_PLAN_BASE_URL ||
        'https://api.openai.com/v1/chat/completions',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('coding-plan', 'apiKey');

    if (!apiKey) {
      throw new Error('Coding Plan API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('Coding Plan base URL not configured');
    }

    const messages: CodingPlanMessage[] = [
      {
        role: 'system',
        content:
          'You are an expert coding assistant. Provide clear, actionable coding plans and solutions. Focus on best practices, architecture, and implementation details.',
      },
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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.7,
          max_tokens: 2048,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Coding Plan API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as CodingPlanResponse;

      if (data.error) {
        throw new Error(`Coding Plan service error: ${data.error.message || 'Unknown service error'}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Coding Plan returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Coding Plan provider: unexpected error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('coding-plan', 'apiKey');
    return Boolean(apiKey);
  }
}
