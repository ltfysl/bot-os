export type StreamChunkCallback = (chunk: string, done: boolean) => void;

export type WakeFailureReason = 'timeout' | 'membership-denied' | 'agent-not-found' | 'provider-not-found' | 'provider-unavailable' | 'general-error';

export interface WakeFailureEvent {
  roomId?: string;
  dmId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  reason: WakeFailureReason;
  errorMessage: string;
  timestamp: number;
}

export interface WakeTimeoutEvent {
  roomId?: string;
  dmId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  timeoutMs: number;
  timestamp: number;
}

export interface WakeMembershipDeniedEvent {
  roomId: string;
  initiatorAgentId: string;
  targetAgentId: string;
  denialReason: 'initiator-not-member' | 'target-not-member';
  timestamp: number;
}

export type WakeEventCallback = (event: WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent) => void;

export interface AgentProvider {
  id: string;
  name: string;
  sendMessage(message: string, context?: Record<string, unknown>): Promise<string>;
  sendMessageStream?(message: string, context: Record<string, unknown> | undefined, onChunk: StreamChunkCallback): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface AgentBusMessage {
  id: string;
  providerId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  metadata?: Record<string, unknown>;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
}

export interface AgentBusConfig {
  providers: AgentProvider[];
  defaultProviderId?: string;
  maxConcurrentWakes?: number;
  wakeQueueLimit?: number;
  onWakeEvent?: WakeEventCallback;
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
  private maxConcurrentWakes: number;
  private wakeQueueLimit: number;
  private onWakeEvent?: WakeEventCallback;
  private activeWakes: number = 0;
  private wakeQueue: Array<{ fn: () => Promise<void>; targetAgentId: string }> = [];

  constructor(config: AgentBusConfig) {
    this.providers = new Map(config.providers.map((p) => [p.id, p]));
    this.defaultProviderId = config.defaultProviderId;
    this.agents = new Map();
    this.maxConcurrentWakes = config.maxConcurrentWakes ?? 10;
    this.wakeQueueLimit = config.wakeQueueLimit ?? 50;
    this.onWakeEvent = config.onWakeEvent;
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
    context?: Record<string, unknown>,
    onWakeResponse?: (response: AgentBusMessage) => void
  ): Promise<AgentBusMessage> {
    const primaryAgent = this.agents.get(agentId);
    if (!primaryAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const primary = await this.sendMessage(message, agentId, context);
    primary.agentId = agentId;
    primary.agentName = primaryAgent.name;
    primary.agentAvatar = primaryAgent.avatar;

    const mentionedAgentIds = this.extractMentions(message);
    const wokeAgents = mentionedAgentIds.filter((id) => id !== agentId);

    if (wokeAgents.length > 0 && onWakeResponse) {
      wokeAgents.forEach((wokeAgentId) => {
        const wakeFn = async () => {
          try {
            const wakeMsg = await this.wakeAgent(wokeAgentId, message, agentId);
            onWakeResponse(wakeMsg);
          } catch (err) {
            console.error(`Failed to wake agent ${wokeAgentId}:`, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            let reason: WakeFailureReason = 'general-error';
            if (errorMessage.includes('timeout') || errorMessage.includes('Wake timeout')) {
              reason = 'timeout';
            } else if (errorMessage.includes('not found')) {
              reason = 'agent-not-found';
            } else if (errorMessage.includes('Provider not found')) {
              reason = 'provider-not-found';
            } else if (errorMessage.includes('not available')) {
              reason = 'provider-unavailable';
            }
            this.emitWakeEvent({
              targetAgentId: wokeAgentId,
              initiatorAgentId: agentId,
              reason,
              errorMessage,
              timestamp: Date.now(),
            });
          }
        };
        this.enqueueWake(wokeAgentId, wakeFn);
      });
    }

    return primary;
  }

  async sendMessageWithWakeStream(
    message: string,
    agentId: string,
    context: Record<string, unknown> | undefined,
    onPrimaryChunk: (agentId: string, chunk: string, done: boolean) => void,
    onWakeChunk?: (wokeAgentId: string, chunk: string, done: boolean) => void
  ): Promise<void> {
    const primaryAgent = this.agents.get(agentId);
    if (!primaryAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const provider = this.providers.get(primaryAgent.providerId);
    if (!provider) {
      throw new Error(`Provider not found for agent: ${primaryAgent.providerId}`);
    }

    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider not available: ${primaryAgent.providerId}`);
    }

    if (provider.sendMessageStream) {
      await provider.sendMessageStream(message, context, (chunk, done) => {
        onPrimaryChunk(agentId, chunk, done);
      });
    } else {
      const response = await provider.sendMessage(message, context);
      onPrimaryChunk(agentId, response, true);
    }

    const mentionedAgentIds = this.extractMentions(message);
    const wokeAgents = mentionedAgentIds.filter((id) => id !== agentId);

    if (wokeAgents.length > 0 && onWakeChunk) {
      wokeAgents.forEach((wokeAgentId) => {
        const wakeFn = async () => {
          try {
            await this.wakeAgentStream(wokeAgentId, message, agentId, onWakeChunk);
          } catch (err) {
            console.error(`Failed to wake agent ${wokeAgentId}:`, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            let reason: WakeFailureReason = 'general-error';
            if (errorMessage.includes('timeout') || errorMessage.includes('Wake timeout')) {
              reason = 'timeout';
            } else if (errorMessage.includes('not found')) {
              reason = 'agent-not-found';
            } else if (errorMessage.includes('Provider not found')) {
              reason = 'provider-not-found';
            } else if (errorMessage.includes('not available')) {
              reason = 'provider-unavailable';
            }
            this.emitWakeEvent({
              targetAgentId: wokeAgentId,
              initiatorAgentId: agentId,
              reason,
              errorMessage,
              timestamp: Date.now(),
            });
          }
        };
        this.enqueueWake(wokeAgentId, wakeFn);
      });
    }
  }

  private async wakeAgentStream(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string,
    onChunk: (wokeAgentId: string, chunk: string, done: boolean) => void
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.emitWakeEvent({
          targetAgentId: wokeAgentId,
          initiatorAgentId: wakerId,
          timeoutMs: 5000,
          timestamp: Date.now(),
        });
        reject(new Error('Wake timeout'));
      }, 5000)
    );

    const wakePromise = this._wakeAgentStreamInternal(wokeAgentId, originalMessage, wakerId, onChunk);

    await Promise.race([wakePromise, timeoutPromise]);
  }

  private async _wakeAgentStreamInternal(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string,
    onChunk: (wokeAgentId: string, chunk: string, done: boolean) => void
  ): Promise<void> {
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

    if (provider.sendMessageStream) {
      await provider.sendMessageStream(wakeContext, { wake: true }, (chunk, done) => {
        onChunk(wokeAgentId, chunk, done);
      });
    } else {
      const response = await provider.sendMessage(wakeContext, { wake: true });
      onChunk(wokeAgentId, response, true);
    }
  }

  async requestAgentWake(
    initiatorAgentId: string,
    targetAgentId: string,
    message: string,
    roomId?: string,
    dmId?: string
  ): Promise<void> {
    const initiator = this.agents.get(initiatorAgentId);
    if (!initiator) {
      const error = new Error(`Initiator agent not found: ${initiatorAgentId}`);
      this.emitWakeEvent({
        targetAgentId,
        initiatorAgentId,
        roomId,
        dmId,
        reason: 'agent-not-found',
        errorMessage: error.message,
        timestamp: Date.now(),
      });
      throw error;
    }

    const target = this.agents.get(targetAgentId);
    if (!target) {
      const error = new Error(`Target agent not found: ${targetAgentId}`);
      this.emitWakeEvent({
        targetAgentId,
        initiatorAgentId,
        roomId,
        dmId,
        reason: 'agent-not-found',
        errorMessage: error.message,
        timestamp: Date.now(),
      });
      throw error;
    }

    if (roomId) {
      const { RoomManager } = require('./rooms');
      const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;
      if (!roomManagerInstance) {
        throw new Error('Room manager not initialized');
      }

      const room = roomManagerInstance.getRoom(roomId);
      if (!room) {
        throw new Error(`Room not found: ${roomId}`);
      }

      if (!room.memberAgentIds.includes(initiatorAgentId)) {
        const error = new Error(`Initiator agent ${initiatorAgentId} is not a member of room ${roomId}`);
        this.emitWakeEvent({
          roomId,
          initiatorAgentId,
          targetAgentId,
          denialReason: 'initiator-not-member',
          timestamp: Date.now(),
        });
        throw error;
      }

      if (!room.memberAgentIds.includes(targetAgentId)) {
        const error = new Error(`Target agent ${targetAgentId} is not a member of room ${roomId}`);
        this.emitWakeEvent({
          roomId,
          initiatorAgentId,
          targetAgentId,
          denialReason: 'target-not-member',
          timestamp: Date.now(),
        });
        throw error;
      }
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.emitWakeEvent({
          roomId,
          dmId,
          initiatorAgentId,
          targetAgentId,
          timeoutMs: 5000,
          timestamp: Date.now(),
        });
        reject(new Error('Wake timeout'));
      }, 5000)
    );

    const wakeContext = `Bot-initiated wake from agent ${initiatorAgentId}: ${message}`;
    const wakePromise = this._wakeAgentInternal(targetAgentId, wakeContext, initiatorAgentId);

    try {
      await Promise.race([wakePromise, timeoutPromise]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (!errorMessage.includes('Wake timeout')) {
        let reason: WakeFailureReason = 'general-error';
        if (errorMessage.includes('not found')) {
          reason = 'agent-not-found';
        } else if (errorMessage.includes('Provider not found')) {
          reason = 'provider-not-found';
        } else if (errorMessage.includes('not available')) {
          reason = 'provider-unavailable';
        }
        this.emitWakeEvent({
          roomId,
          dmId,
          initiatorAgentId,
          targetAgentId,
          reason,
          errorMessage,
          timestamp: Date.now(),
        });
      }
      throw err;
    }
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
  ): Promise<AgentBusMessage> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.emitWakeEvent({
          targetAgentId: wokeAgentId,
          initiatorAgentId: wakerId,
          timeoutMs: 5000,
          timestamp: Date.now(),
        });
        reject(new Error('Wake timeout'));
      }, 5000)
    );

    const wakePromise = this._wakeAgentInternal(wokeAgentId, originalMessage, wakerId);

    return Promise.race([wakePromise, timeoutPromise]);
  }

  private async _wakeAgentInternal(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string
  ): Promise<AgentBusMessage> {
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
      id: `${Date.now()}-${wokeAgentId}`,
      providerId: wokeAgent.providerId,
      content: response,
      role: 'assistant',
      timestamp: Date.now(),
      metadata: { wake: true },
      agentId: wokeAgentId,
      agentName: wokeAgent.name,
      agentAvatar: wokeAgent.avatar,
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
    
    const { hasProviderSecret } = require('./secrets');
    
    if (providerId === 'minimax') {
      return hasProviderSecret('minimax', 'apiKey');
    }
    
    if (providerId === 'zai') {
      return hasProviderSecret('zai', 'apiKey');
    }
    
    if (providerId === 'coding-plan') {
      return hasProviderSecret('coding-plan', 'apiKey');
    }
    
    if (providerId === 'anthropic') {
      return hasProviderSecret('anthropic', 'apiKey');
    }
    
    if (providerId === 'openai') {
      return hasProviderSecret('openai', 'apiKey') || Boolean(process.env.OPENAI_API_KEY);
    }
    
    if (providerId === 'gemini') {
      return hasProviderSecret('gemini', 'apiKey') || Boolean(process.env.GEMINI_API_KEY);
    }
    
    return false;
  }

  private emitWakeEvent(event: WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent): void {
    if (this.onWakeEvent) {
      this.onWakeEvent(event);
    }
  }

  private async enqueueWake(targetAgentId: string, wakeFn: () => Promise<void>): Promise<void> {
    if (this.activeWakes < this.maxConcurrentWakes) {
      this.activeWakes++;
      try {
        await wakeFn();
      } finally {
        this.activeWakes--;
        this.processWakeQueue();
      }
    } else {
      if (this.wakeQueue.length >= this.wakeQueueLimit) {
        const droppedWake = this.wakeQueue.shift();
        if (droppedWake) {
          this.emitWakeEvent({
            targetAgentId: droppedWake.targetAgentId,
            reason: 'general-error',
            errorMessage: `Wake queue full (limit: ${this.wakeQueueLimit}), oldest wake dropped`,
            timestamp: Date.now(),
          });
        }
      }
      this.wakeQueue.push({ fn: wakeFn, targetAgentId });
    }
  }

  private processWakeQueue(): void {
    if (this.wakeQueue.length > 0 && this.activeWakes < this.maxConcurrentWakes) {
      const next = this.wakeQueue.shift();
      if (next) {
        this.activeWakes++;
        next.fn()
          .catch((err) => {
            console.error(`Queued wake failed for agent ${next.targetAgentId}:`, err);
          })
          .finally(() => {
            this.activeWakes--;
            this.processWakeQueue();
          });
      }
    }
  }

  getWakeQueueStats(): { active: number; queued: number; queueLimit: number; maxConcurrent: number } {
    return {
      active: this.activeWakes,
      queued: this.wakeQueue.length,
      queueLimit: this.wakeQueueLimit,
      maxConcurrent: this.maxConcurrentWakes,
    };
  }
}
