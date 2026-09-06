export interface AgentProvider {
  id: string;
  name: string;
  sendMessage(message: string, context?: Record<string, unknown>): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export interface AgentBusMessage {
  id: string;
  providerId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentBusConfig {
  providers: AgentProvider[];
  defaultProviderId?: string;
}

export class AgentBus {
  private providers: Map<string, AgentProvider>;
  private defaultProviderId?: string;

  constructor(config: AgentBusConfig) {
    this.providers = new Map(config.providers.map((p) => [p.id, p]));
    this.defaultProviderId = config.defaultProviderId;
  }

  async sendMessage(
    message: string,
    providerId?: string,
    context?: Record<string, unknown>
  ): Promise<AgentBusMessage> {
    const targetProviderId = providerId || this.defaultProviderId;
    if (!targetProviderId) {
      throw new Error('No provider specified and no default provider set');
    }

    const provider = this.providers.get(targetProviderId);
    if (!provider) {
      throw new Error(`Provider not found: ${targetProviderId}`);
    }

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider not available: ${targetProviderId}`);
    }

    const response = await provider.sendMessage(message, context);

    return {
      id: Date.now().toString(),
      providerId: targetProviderId,
      content: response,
      role: 'assistant',
      timestamp: Date.now(),
      metadata: context,
    };
  }

  getProvider(providerId: string): AgentProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): AgentProvider[] {
    return Array.from(this.providers.values());
  }

  registerProvider(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }
}
