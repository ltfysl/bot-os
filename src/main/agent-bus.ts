export type StreamChunkCallback = (chunk: string, done: boolean) => void;

export type WakeFailureReason = 'timeout' | 'membership-denied' | 'agent-not-found' | 'provider-not-found' | 'provider-unavailable' | 'general-error' | 'cancelled';

export interface WakeFailureEvent {
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  reason: WakeFailureReason;
  errorMessage: string;
  timestamp: number;
}

export interface WakeTimeoutEvent {
  roomId?: string;
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

export interface WakeBackpressureEvent {
  targetAgentId: string;
  queuePosition: number;
  queueLength: number;
  activeWakes: number;
  timestamp: number;
}

export interface WakeCancelledEvent {
  kind: 'cancelled';
  wakeId: string;
  targetAgentId: string;
  initiatorAgentId?: string | undefined;
  roomId?: string | undefined;
  timestamp: number;
}

export interface WakeStartedEvent {
  kind: 'started';
  wakeId: string;
  targetAgentId: string;
  initiatorAgentId?: string | undefined;
  roomId?: string | undefined;
  timestamp: number;
}

export interface WakeOrderSkipEvent {
  kind: 'order-skip';
  wakeId: string;
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  reason: 'membership-denied' | 'agent-not-found' | 'timeout' | 'general-error';
  errorMessage: string;
  timestamp: number;
  orderPosition: number;
}

export type WakeEventCallback = (event: WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent | WakeBackpressureEvent | WakeCancelledEvent | WakeStartedEvent | WakeOrderSkipEvent) => void;

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
  private wakeQueue: Array<{ 
    wakeId: string;
    fn: () => Promise<void>; 
    targetAgentId: string; 
    resolve: () => void; 
    reject: (err: Error) => void;
  }> = [];
  private activeWakeIds: Map<string, { 
    targetAgentId: string; 
    initiatorAgentId?: string;
    roomId?: string;
    cancelled: boolean;
  }> = new Map();
  private wakeIdCounter: number = 0;

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

    if (wokeAgents.length > 0 && onWakeResponse && !context?.skipWakeFanOut) {
      const roomId = context?.room as string | undefined || context?.roomId as string | undefined;
      
      wokeAgents.forEach((wokeAgentId) => {
        if (roomId) {
          const { RoomManager } = require('./rooms');
          const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;
          
          if (!roomManagerInstance) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
          
          const room = roomManagerInstance.getRoom(roomId);
          if (!room) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
          
          if (!room.memberAgentIds.includes(wokeAgentId)) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
        }
        
        const wakeId = `wake-${Date.now()}-${wokeAgentId}-${Math.random().toString(36).slice(2, 9)}`;
        this.activeWakeIds.set(wakeId, {
          targetAgentId: wokeAgentId,
          initiatorAgentId: agentId,
          roomId,
          cancelled: false,
        });
        this.emitWakeEvent({
          kind: 'started',
          wakeId,
          targetAgentId: wokeAgentId,
          initiatorAgentId: agentId,
          roomId,
          timestamp: Date.now(),
        });
        
        const wakeFn = async () => {
          try {
            const wakeMsg = await this.wakeAgent(wokeAgentId, message, agentId, wakeId);
            onWakeResponse(wakeMsg);
          } catch (err) {
            console.error(`Failed to wake agent ${wokeAgentId}:`, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            let reason: WakeFailureReason = 'general-error';
            if (errorMessage.includes('cancelled') || errorMessage.includes('Wake cancelled')) {
              reason = 'cancelled';
            } else if (errorMessage.includes('timeout') || errorMessage.includes('Wake timeout')) {
              reason = 'timeout';
            } else if (errorMessage.includes('not found')) {
              reason = 'agent-not-found';
            } else if (errorMessage.includes('Provider not found')) {
              reason = 'provider-not-found';
            } else if (errorMessage.includes('not available')) {
              reason = 'provider-unavailable';
            }
            this.emitWakeEvent({
              roomId: context?.room as string | undefined || context?.roomId as string | undefined,
              targetAgentId: wokeAgentId,
              initiatorAgentId: agentId,
              reason,
              errorMessage,
              timestamp: Date.now(),
            });
          } finally {
            this.activeWakeIds.delete(wakeId);
          }
        };
        this.enqueueWake(wokeAgentId, wakeFn, wakeId, agentId, roomId);
      });
    }

    return primary;
  }

  async sendMessageWithWakeStream(
    message: string,
    agentId: string,
    context: Record<string, unknown> | undefined,
    onPrimaryChunk: (agentId: string, chunk: string, done: boolean, wakeId?: string) => void,
    onWakeChunk?: (wokeAgentId: string, chunk: string, done: boolean, wakeId?: string) => void
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

    const roomId = context?.room as string | undefined || context?.roomId as string | undefined;
    // Room fan-out uses this method with the target as primary — register a wakeId so Square can cancel.
    // Ordered fan-out (`skipWakeFanOut`) already registered its own wakeId.
    let primaryWakeId: string | undefined;
    if (roomId && !context?.skipWakeFanOut) {
      primaryWakeId = `wake-${Date.now()}-${agentId}-${Math.random().toString(36).slice(2, 9)}`;
      this.activeWakeIds.set(primaryWakeId, {
        targetAgentId: agentId,
        initiatorAgentId: undefined,
        roomId,
        cancelled: false,
      });
      this.emitWakeEvent({
        kind: 'started',
        wakeId: primaryWakeId,
        targetAgentId: agentId,
        roomId,
        timestamp: Date.now(),
      });
    }

    const emitPrimary = (chunk: string, done: boolean) => {
      if (primaryWakeId) {
        const active = this.activeWakeIds.get(primaryWakeId);
        if (active?.cancelled) {
          throw new Error('Wake cancelled');
        }
      }
      onPrimaryChunk(agentId, chunk, done, primaryWakeId);
    };

    try {
      if (provider.sendMessageStream) {
        await provider.sendMessageStream(message, context, (chunk, done) => {
          emitPrimary(chunk, done);
        });
      } else {
        const response = await provider.sendMessage(message, context);
        emitPrimary(response, true);
      }
    } finally {
      if (primaryWakeId) {
        this.activeWakeIds.delete(primaryWakeId);
      }
    }

    const mentionedAgentIds = this.extractMentions(message);
    const wokeAgents = mentionedAgentIds.filter((id) => id !== agentId);

    if (wokeAgents.length > 0 && onWakeChunk && !context?.skipWakeFanOut) {
      wokeAgents.forEach((wokeAgentId) => {
        if (roomId) {
          const { RoomManager } = require('./rooms');
          const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;
          
          if (!roomManagerInstance) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
          
          const room = roomManagerInstance.getRoom(roomId);
          if (!room) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
          
          if (!room.memberAgentIds.includes(wokeAgentId)) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
        }
        
        const wakeId = `wake-${Date.now()}-${wokeAgentId}-${Math.random().toString(36).slice(2, 9)}`;
        this.activeWakeIds.set(wakeId, {
          targetAgentId: wokeAgentId,
          initiatorAgentId: agentId,
          roomId,
          cancelled: false,
        });
        this.emitWakeEvent({
          kind: 'started',
          wakeId,
          targetAgentId: wokeAgentId,
          initiatorAgentId: agentId,
          roomId,
          timestamp: Date.now(),
        });
        
        const wakeFn = async () => {
          try {
            await this.wakeAgentStream(wokeAgentId, message, agentId, onWakeChunk, wakeId);
          } catch (err) {
            console.error(`Failed to wake agent ${wokeAgentId}:`, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            let reason: WakeFailureReason = 'general-error';
            if (errorMessage.includes('cancelled') || errorMessage.includes('Wake cancelled')) {
              reason = 'cancelled';
            } else if (errorMessage.includes('timeout') || errorMessage.includes('Wake timeout')) {
              reason = 'timeout';
            } else if (errorMessage.includes('not found')) {
              reason = 'agent-not-found';
            } else if (errorMessage.includes('Provider not found')) {
              reason = 'provider-not-found';
            } else if (errorMessage.includes('not available')) {
              reason = 'provider-unavailable';
            }
            this.emitWakeEvent({
              roomId: context?.room as string | undefined || context?.roomId as string | undefined,
              targetAgentId: wokeAgentId,
              initiatorAgentId: agentId,
              reason,
              errorMessage,
              timestamp: Date.now(),
            });
          } finally {
            this.activeWakeIds.delete(wakeId);
          }
        };
        this.enqueueWake(wokeAgentId, wakeFn, wakeId, agentId, roomId);
      });
    }
  }

  private async wakeAgentStream(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string,
    onChunk: (wokeAgentId: string, chunk: string, done: boolean, wakeId?: string) => void,
    wakeId?: string
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

    const wakePromise = this._wakeAgentStreamInternal(wokeAgentId, originalMessage, wakerId, onChunk, wakeId);

    await Promise.race([wakePromise, timeoutPromise]);
  }

  private async _wakeAgentStreamInternal(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string,
    onChunk: (wokeAgentId: string, chunk: string, done: boolean, wakeId?: string) => void,
    wakeId?: string
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
        if (wakeId) {
          const activeWake = this.activeWakeIds.get(wakeId);
          if (activeWake?.cancelled) {
            throw new Error('Wake cancelled');
          }
        }
        onChunk(wokeAgentId, chunk, done, wakeId);
      });
    } else {
      if (wakeId) {
        const activeWake = this.activeWakeIds.get(wakeId);
        if (activeWake?.cancelled) {
          throw new Error('Wake cancelled');
        }
      }
      const response = await provider.sendMessage(wakeContext, { wake: true });
      onChunk(wokeAgentId, response, true, wakeId);
    }
  }

  async requestAgentWake(
    initiatorAgentId: string,
    targetAgentId: string,
    message: string,
    roomId?: string
  ): Promise<{ wakeId: string }> {
    const initiator = this.agents.get(initiatorAgentId);
    if (!initiator) {
      const error = new Error(`Initiator agent not found: ${initiatorAgentId}`);
      this.emitWakeEvent({
        targetAgentId,
        initiatorAgentId,
        roomId,
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

    const wakeContext = `Bot-initiated wake from agent ${initiatorAgentId}: ${message}`;
    const wakeId = `wake-${Date.now()}-${targetAgentId}-${Math.random().toString(36).slice(2, 9)}`;
    
    this.activeWakeIds.set(wakeId, {
      targetAgentId,
      initiatorAgentId,
      roomId,
      cancelled: false,
    });
    this.emitWakeEvent({
      kind: 'started',
      wakeId,
      targetAgentId,
      initiatorAgentId,
      roomId,
      timestamp: Date.now(),
    });
    
    const wakeFn = async () => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          this.emitWakeEvent({
            roomId,
            initiatorAgentId,
            targetAgentId,
            timeoutMs: 5000,
            timestamp: Date.now(),
          });
          reject(new Error('Wake timeout'));
        }, 5000)
      );

      const wakePromise = this._wakeAgentInternal(targetAgentId, wakeContext, initiatorAgentId, wakeId);

      try {
        await Promise.race([wakePromise, timeoutPromise]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (!errorMessage.includes('Wake timeout')) {
          let reason: WakeFailureReason = 'general-error';
          if (errorMessage.includes('cancelled') || errorMessage.includes('Wake cancelled')) {
            reason = 'cancelled';
          } else if (errorMessage.includes('not found')) {
            reason = 'agent-not-found';
          } else if (errorMessage.includes('Provider not found')) {
            reason = 'provider-not-found';
          } else if (errorMessage.includes('not available')) {
            reason = 'provider-unavailable';
          }
          this.emitWakeEvent({
            roomId,
            initiatorAgentId,
            targetAgentId,
            reason,
            errorMessage,
            timestamp: Date.now(),
          });
        }
        throw err;
      } finally {
        this.activeWakeIds.delete(wakeId);
      }
    };

    // Soft (Remy): return wakeId immediately; do not await wake completion.
    void this.enqueueWake(targetAgentId, wakeFn, wakeId, initiatorAgentId, roomId);
    return { wakeId };
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
    wakerId: string,
    wakeId?: string
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

    const wakePromise = this._wakeAgentInternal(wokeAgentId, originalMessage, wakerId, wakeId);

    return Promise.race([wakePromise, timeoutPromise]);
  }

  private async _wakeAgentInternal(
    wokeAgentId: string,
    originalMessage: string,
    wakerId: string,
    wakeId?: string
  ): Promise<AgentBusMessage> {
    if (wakeId) {
      const activeWake = this.activeWakeIds.get(wakeId);
      if (activeWake?.cancelled) {
        throw new Error('Wake cancelled');
      }
    }
    
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

    if (wakeId) {
      const activeWake = this.activeWakeIds.get(wakeId);
      if (activeWake?.cancelled) {
        throw new Error('Wake cancelled');
      }
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
    
    if (providerId === 'xai') {
      return hasProviderSecret('xai', 'apiKey') || Boolean(process.env.XAI_API_KEY);
    }
    
    return false;
  }

  private emitWakeEvent(event: WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent | WakeBackpressureEvent | WakeCancelledEvent | WakeStartedEvent | WakeOrderSkipEvent): void {
    if (this.onWakeEvent) {
      this.onWakeEvent(event);
    }
  }

  private async enqueueWake(targetAgentId: string, wakeFn: () => Promise<void>, wakeId?: string, initiatorAgentId?: string, roomId?: string): Promise<void> {
    const finalWakeId = wakeId || `wake-${Date.now()}-${targetAgentId}-${Math.random().toString(36).slice(2, 9)}`;
    
    if (!wakeId) {
      this.activeWakeIds.set(finalWakeId, {
        targetAgentId,
        initiatorAgentId,
        roomId,
        cancelled: false,
      });
      this.emitWakeEvent({
        kind: 'started',
        wakeId: finalWakeId,
        targetAgentId,
        initiatorAgentId,
        roomId,
        timestamp: Date.now(),
      });
    }
    
    if (this.activeWakes < this.maxConcurrentWakes) {
      this.activeWakes++;
      try {
        await wakeFn();
      } finally {
        this.activeWakes--;
        this.activeWakeIds.delete(finalWakeId);
        this.processWakeQueue();
      }
    } else {
      return new Promise<void>((resolve, reject) => {
        if (this.wakeQueue.length >= this.wakeQueueLimit) {
          const droppedWake = this.wakeQueue.shift();
          if (droppedWake) {
            this.activeWakeIds.delete(droppedWake.wakeId);
            droppedWake.reject(new Error(`Wake queue full (limit: ${this.wakeQueueLimit}), oldest wake dropped`));
            this.emitWakeEvent({
              targetAgentId: droppedWake.targetAgentId,
              reason: 'general-error',
              errorMessage: `Wake queue full (limit: ${this.wakeQueueLimit}), oldest wake dropped`,
              timestamp: Date.now(),
            });
          }
        }
        this.wakeQueue.push({ wakeId: finalWakeId, fn: wakeFn, targetAgentId, resolve, reject });
        this.emitWakeEvent({
          targetAgentId,
          queuePosition: this.wakeQueue.length,
          queueLength: this.wakeQueue.length,
          activeWakes: this.activeWakes,
          timestamp: Date.now(),
        });
      });
    }
  }

  private processWakeQueue(): void {
    if (this.wakeQueue.length > 0 && this.activeWakes < this.maxConcurrentWakes) {
      const next = this.wakeQueue.shift();
      if (next) {
        this.activeWakes++;
        next.fn()
          .then(() => {
            next.resolve();
          })
          .catch((err) => {
            console.error(`Queued wake failed for agent ${next.targetAgentId}:`, err);
            next.reject(err);
          })
          .finally(() => {
            this.activeWakes--;
            this.activeWakeIds.delete(next.wakeId);
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


  private generateWakeId(targetAgentId: string, initiatorAgentId?: string, roomId?: string): string {
    const counter = this.wakeIdCounter++;
    const parts = ['wake', String(Date.now()), String(counter), targetAgentId];
    if (initiatorAgentId) parts.push(initiatorAgentId);
    if (roomId) parts.push(roomId);
    return parts.join('-');
  }

  async enqueueOrderedWakes(
    targets: Array<{ agentId: string; message: string }>,
    initiatorAgentId?: string,
    roomId?: string,
    onChunk?: (wakeId: string, agentId: string, chunk: string, done: boolean) => void,
    onComplete?: (wakeId: string, agentId: string, message: AgentBusMessage) => void
  ): Promise<void> {
    for (let orderPosition = 0; orderPosition < targets.length; orderPosition++) {
      const target = targets[orderPosition];
      const wakeId = this.generateWakeId(target.agentId, initiatorAgentId, roomId);

      const emitSkip = (reason: WakeOrderSkipEvent['reason'], errorMessage: string) => {
        this.emitWakeEvent({
          kind: 'order-skip',
          wakeId,
          roomId,
          initiatorAgentId,
          targetAgentId: target.agentId,
          reason,
          errorMessage,
          timestamp: Date.now(),
          orderPosition,
        });
      };

      try {
        if (roomId) {
          const { RoomManager } = require('./rooms');
          const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;

          if (!roomManagerInstance) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: initiatorAgentId || 'system',
              targetAgentId: target.agentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            emitSkip('membership-denied', 'Room manager not initialized');
            continue;
          }

          const room = roomManagerInstance.getRoom(roomId);
          if (!room) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: initiatorAgentId || 'system',
              targetAgentId: target.agentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            emitSkip('membership-denied', `Room not found: ${roomId}`);
            continue;
          }

          if (!room.memberAgentIds.includes(target.agentId)) {
            this.emitWakeEvent({
              roomId,
              initiatorAgentId: initiatorAgentId || 'system',
              targetAgentId: target.agentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            emitSkip('membership-denied', `Target agent ${target.agentId} is not a member of room ${roomId}`);
            continue;
          }
        }

        if (!this.agents.get(target.agentId)) {
          emitSkip('agent-not-found', `Agent not found: ${target.agentId}`);
          continue;
        }

        this.activeWakeIds.set(wakeId, {
          targetAgentId: target.agentId,
          initiatorAgentId,
          roomId,
          cancelled: false,
        });
        this.emitWakeEvent({
          kind: 'started',
          wakeId,
          targetAgentId: target.agentId,
          initiatorAgentId,
          roomId,
          timestamp: Date.now(),
        });

        await this.enqueueWake(
          target.agentId,
          async () => {
            try {
              const active = this.activeWakeIds.get(wakeId);
              if (active?.cancelled) {
                throw new Error('Wake cancelled');
              }

              const context: Record<string, unknown> | undefined = roomId
                ? { room: roomId, skipWakeFanOut: true }
                : { skipWakeFanOut: true };

              if (onChunk) {
                // Room/stream fan-out: target is primary (not wake-from-agent context).
                await this.sendMessageWithWakeStream(
                  target.message,
                  target.agentId,
                  context,
                  (_agentId, chunk, done, _primaryWakeId) => {
                    const still = this.activeWakeIds.get(wakeId);
                    if (still?.cancelled) {
                      throw new Error('Wake cancelled');
                    }
                    onChunk(wakeId, target.agentId, chunk, done);
                  }
                );
              } else {
                const response = await this.sendMessage(target.message, target.agentId, context);
                if (onComplete) {
                  onComplete(wakeId, target.agentId, response);
                }
              }
            } finally {
              this.activeWakeIds.delete(wakeId);
            }
          },
          wakeId,
          initiatorAgentId,
          roomId
        );
      } catch (err) {
        console.error(`Ordered wake failed for ${target.agentId} (position ${orderPosition}):`, err);
        this.activeWakeIds.delete(wakeId);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        let reason: WakeOrderSkipEvent['reason'] = 'general-error';
        if (errorMessage.includes('timeout') || errorMessage.includes('Wake timeout')) {
          reason = 'timeout';
        } else if (errorMessage.includes('not found') || errorMessage.includes('Agent not found')) {
          reason = 'agent-not-found';
        } else if (errorMessage.includes('member')) {
          reason = 'membership-denied';
        }
        emitSkip(reason, errorMessage);
      }
    }
  }

  cancelWake(wakeId: string): { cancelled: boolean; wasActive: boolean; wasQueued: boolean } {
    // Queue first: wakes are pre-registered in activeWakeIds before enqueue.
    const queueIndex = this.wakeQueue.findIndex((w) => w.wakeId === wakeId);
    if (queueIndex !== -1) {
      const queuedWake = this.wakeQueue.splice(queueIndex, 1)[0];
      const activeWakeEntry = this.activeWakeIds.get(wakeId);
      this.activeWakeIds.delete(wakeId);

      const event: WakeCancelledEvent = {
        kind: 'cancelled',
        wakeId,
        targetAgentId: queuedWake.targetAgentId,
        initiatorAgentId: activeWakeEntry?.initiatorAgentId,
        roomId: activeWakeEntry?.roomId,
        timestamp: Date.now(),
      };
      this.emitWakeEvent(event);

      queuedWake.reject(new Error('Wake cancelled'));
      return { cancelled: true, wasActive: false, wasQueued: true };
    }

    const activeWake = this.activeWakeIds.get(wakeId);
    if (activeWake) {
      activeWake.cancelled = true;
      const event: WakeCancelledEvent = {
        kind: 'cancelled',
        wakeId,
        targetAgentId: activeWake.targetAgentId,
        initiatorAgentId: activeWake.initiatorAgentId,
        roomId: activeWake.roomId,
        timestamp: Date.now(),
      };
      this.emitWakeEvent(event);
      return { cancelled: true, wasActive: true, wasQueued: false };
    }

    return { cancelled: false, wasActive: false, wasQueued: false };
  }
}
