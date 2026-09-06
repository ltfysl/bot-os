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
  wakerId?: string;
}

export interface WakeResult {
  wokeAgentId: string;
  wokeAgentName: string;
  response: AgentBusMessage;
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

  async sendMessageWithWake(
    message: string,
    agentId: string,
    context?: Record<string, unknown>
  ): Promise<{ primary: AgentBusMessage; wakeResults: WakeResult[] }> {
    const mentionedAgentIds = this.extractMentions(message);
    const wokeAgents = mentionedAgentIds.filter((id) => id !== agentId);

    const wakePromises = wokeAgents.map((wokeAgentId) =>
      this.wakeAgent(wokeAgentId, message, agentId).catch((err) => {
        console.error(`Failed to wake agent ${wokeAgentId}:`, err);
        return null;
      })
    );

    const [primaryResponse, ...wakeSettled] = await Promise.all([
      this.sendMessage(message, agentId, context),
      ...wakePromises.map((p) => this.timeoutPromise(p, 5000)),
    ]);

    const wakeResults = wakeSettled.filter((r): r is WakeResult => r !== null);

    return { primary: primaryResponse, wakeResults };
  }

  private extractMentions(message: string): string[] {
    const mentionPattern = /@(\w+)/g;
    const matches = Array.from(message.matchAll(mentionPattern));
    const mentionedNames = matches.map((m) => m[1].toLowerCase());

    const agentIds: string[] = [];
    for (const agent of this.agents.values()) {
      if (mentionedNames.includes(agent.name.toLowerCase())) {
        agentIds.push(agent.id);
      }
    }
    return agentIds;
  }

  private async wakeAgent(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string
  ): Promise<WakeResult> {
    const wokeAgent = this.agents.get(wokeAgentId);
    if (!wokeAgent) {
      throw new Error(`Woken agent not found: ${wokeAgentId}`);
    }

    const provider = this.providers.get(wokeAgent.providerId);
    if (!provider) {
      throw new Error(`Provider not found for woken agent: ${wokeAgent.providerId}`);
    }

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider not available for woken agent: ${wokeAgent.providerId}`);
    }

    const wakeContext = `Wake request from agent ${wakerId}: ${originalMessage}`;
    const response = await provider.sendMessage(wakeContext, { wake: true });

    return {
      wokeAgentId,
      wokeAgentName: wokeAgent.name,
      response: {
        id: `${Date.now()}-${wokeAgentId}`,
        providerId: wokeAgent.providerId,
        content: response,
        role: 'assistant',
        timestamp: Date.now(),
        metadata: { wake: true },
        wakerId,
      },
    };
  }

  private async timeoutPromise<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
    return Promise.race([promise, timeout]);
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
