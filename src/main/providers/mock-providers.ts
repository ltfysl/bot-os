import type { AgentProvider } from '../agent-bus';

export class MockEchoProvider implements AgentProvider {
  readonly id = 'mock-echo';
  readonly name = 'Mock Echo Provider';

  async sendMessage(message: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
    return `Echo: ${message}`;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export class MockIntelligentProvider implements AgentProvider {
  readonly id = 'mock-intelligent';
  readonly name = 'Mock Intelligent Provider';

  private responses = [
    "That's an interesting question. Let me think about that...",
    'I understand what you mean. Here are my thoughts:',
    "Great point! I'd like to add:",
    "That's a complex topic. Here's my perspective:",
    'Absolutely! Let me elaborate on that.',
  ];

  async sendMessage(message: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));
    
    const randomResponse =
      this.responses[Math.floor(Math.random() * this.responses.length)];
    
    return `${randomResponse}\n\nRegarding "${message.slice(0, 50)}${
      message.length > 50 ? '...' : ''
    }", I think this is a valuable discussion point worth exploring further.`;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
