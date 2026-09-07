import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface XAIConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface XAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface XAIResponse {
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

export class XAIProvider implements AgentProvider {
  readonly id = 'xai';
  readonly name = 'xAI Grok';

  private config: XAIConfig;

  constructor(config: XAIConfig = {}) {
    this.config = {
      model: config.model || 'grok-2-latest',
      baseUrl: config.baseUrl || process.env.XAI_BASE_URL || 'https://api.x.ai/v1/chat/completions',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('xai', 'apiKey') || process.env.XAI_API_KEY;

    if (!apiKey) {
      throw new Error('xAI API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('xAI base URL not configured');
    }

    const messages: XAIMessage[] = [
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
        throw new Error(`xAI API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as XAIResponse;

      if (data.error) {
        throw new Error(`xAI service error: ${data.error.message || 'Unknown service error'}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('xAI returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('xAI provider: unexpected error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('xai', 'apiKey') || process.env.XAI_API_KEY;
    return Boolean(apiKey);
  }
}
