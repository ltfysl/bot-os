import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface OpenAIConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export class OpenAIProvider implements AgentProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  private config: OpenAIConfig;

  constructor(config: OpenAIConfig = {}) {
    this.config = {
      model: config.model || 'gpt-4o-mini',
      baseUrl: config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('openai', 'apiKey');

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('OpenAI base URL not configured');
    }

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Provide concise, direct responses.',
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
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: 512,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as OpenAIResponse;

      if (data.error) {
        throw new Error(`OpenAI service error: ${data.error.message || 'Unknown service error'}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('OpenAI provider: unexpected error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('openai', 'apiKey');
    return Boolean(apiKey);
  }
}
