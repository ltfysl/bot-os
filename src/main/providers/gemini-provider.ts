import type { AgentProvider, StreamChunkCallback } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GeminiResponse {
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
    delta?: {
      content?: string;
    };
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

export class GeminiProvider implements AgentProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';

  private config: GeminiConfig;

  constructor(config: GeminiConfig = {}) {
    this.config = {
      model: config.model || 'gemini-2.0-flash',
      baseUrl: config.baseUrl || process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    const apiKey = this.config.apiKey || getProviderSecret('gemini', 'apiKey') || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('Gemini base URL not configured');
    }

    const messages: GeminiMessage[] = [
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
          max_completion_tokens: 512,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as GeminiResponse;

      if (data.error) {
        throw new Error(`Gemini service error: ${data.error.message || 'Unknown service error'}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Gemini returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Gemini provider: unexpected error');
    }
  }

  async sendMessageStream(
    message: string,
    context: Record<string, unknown> | undefined,
    onChunk: StreamChunkCallback
  ): Promise<void> {
    const apiKey = this.config.apiKey || getProviderSecret('gemini', 'apiKey') || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('Gemini base URL not configured');
    }

    const messages: GeminiMessage[] = [
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
          max_completion_tokens: 512,
          temperature: 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Gemini: no response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = trimmed.slice(6);
            const data = JSON.parse(json) as GeminiResponse;

            if (data.error) {
              throw new Error(`Gemini service error: ${data.error.message || 'Unknown service error'}`);
            }

            const chunk = data.choices?.[0]?.delta?.content;
            if (chunk) {
              fullContent += chunk;
              onChunk(chunk, false);
            }
          } catch (parseError) {
            console.error('Failed to parse SSE chunk:', trimmed, parseError);
          }
        }
      }

      onChunk(fullContent, true);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Gemini provider: unexpected streaming error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('gemini', 'apiKey') || process.env.GEMINI_API_KEY;
    return Boolean(apiKey);
  }
}
