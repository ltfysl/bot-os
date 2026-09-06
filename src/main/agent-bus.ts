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

export interface AgentDescriptor {
  id: string;
  name: string;
  providerId: string;
  avatar: string;
  status: 'active' | 'idle' | 'offline';
  unread?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  hasSecret: boolean;
  isAvailable: boolean;
}

export class AgentBus {
  private providers: Map<string, AgentProvider>;
  private defaultProviderId?: string;
  private agents: Map<string, AgentDescriptor>;

  constructor(config: AgentBusConfig) {
    this.providers = new Map(config.providers.map((p) => [p.id, p]));
    this.defaultProviderId = config.defaultProviderId;
    this.agents = new Map();
  }

  async sendMessage(
    message: string,
    agentId: string,
    context?: Record<string, unknown>
  ): Promise<AgentBusMessage> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const provider = this.providers.get(agent.providerId);
    if (!provider) {
      throw new Error(`Provider not found for agent: ${agent.providerId}`);
    }

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider not available: ${agent.providerId}`);
    }

    const response = await provider.sendMessage(message, context);

    return {
      id: Date.now().toString(),
      providerId: agent.providerId,
      content: response,
      role: 'assistant',
      timestamp: Date.now(),
      metadata: context,
    };
  }

  getProvider(providerId: string): AgentProvider | undefined {
    return this.providers.get(providerId);
  }

  async getAllProviders(): Promise<ProviderInfo[]> {
    const infos: ProviderInfo[] = [];
    for (const provider of this.providers.values()) {
      infos.push({
        id: provider.id,
        name: provider.name,
        hasSecret: this.providerHasSecret(provider.id),
        isAvailable: await provider.isAvailable(),
      });
    }
    return infos;
  }

  registerProvider(provider: AgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    this.defaultProviderId = providerId;
  }

  getDefaultProviderId(): string | undefined {
    return this.defaultProviderId;
  }

  registerAgent(agent: AgentDescriptor): void {
    this.agents.set(agent.id, agent);
  }

  unregisterAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  getAgent(agentId: string): AgentDescriptor | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentDescriptor[] {
    return Array.from(this.agents.values());
  }

  updateAgentProvider(agentId: string, providerId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    this.agents.set(agentId, { ...agent, providerId });
  }

  private providerHasSecret(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    
    if (providerId === 'minimax') {
      const { hasProviderSecret } = require('./secrets');
      return hasProviderSecret('minimax', 'apiKey') && hasProviderSecret('minimax', 'groupId');
    }
    
    return false;
  }
}
