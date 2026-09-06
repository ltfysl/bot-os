import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface MiniMaxConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

interface MiniMaxResponse {
  id?: string;
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
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

export class MiniMaxProvider implements AgentProvider {
  readonly id = 'minimax';
  readonly name = 'MiniMax';

  private config: MiniMaxConfig;

  constructor(config: MiniMaxConfig = {}) {
    this.config = {
      model: config.model || 'MiniMax-Text-01',
      baseUrl: config.baseUrl || 'https://api.minimax.io/v1/text/chatcompletion_v2',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('minimax', 'apiKey');

    if (!apiKey) {
      throw new Error('MiniMax API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('MiniMax base URL not configured');
    }

    const messages: MiniMaxMessage[] = [
      {
        role: 'system',
        name: 'Assistant',
        content: 'You are a helpful AI assistant. Provide concise, direct responses.',
      },
      {
        role: 'user',
        name: 'User',
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
          temperature: 0.9,
          top_p: 0.95,
          max_completion_tokens: 512,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`MiniMax API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as MiniMaxResponse;

      if (data.base_resp?.status_code !== undefined && data.base_resp.status_code !== 0) {
        throw new Error(
          `MiniMax service error: ${data.base_resp.status_msg || 'Unknown service error'}`
        );
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('MiniMax returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('MiniMax provider: unexpected error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('minimax', 'apiKey');
    return Boolean(apiKey);
  }
}
