import { sanitizeErrorMessage } from './providers/error-text';
export type StreamChunkCallback = (chunk: string, done: boolean) => void;

export type WakeFailureReason = 'timeout' | 'membership-denied' | 'agent-not-found' | 'provider-not-found' | 'provider-unavailable' | 'general-error' | 'cancelled';

export interface WakeFailureEvent {
  wakeId?: string;
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  reason: WakeFailureReason;
  errorMessage: string;
  timestamp: number;
}

export interface WakeTimeoutEvent {
  wakeId?: string;
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  timeoutMs: number;
  timestamp: number;
}

export interface WakeMembershipDeniedEvent {
  wakeId?: string;
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
  chainId?: string;
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
  reason: 'membership-denied' | 'agent-not-found' | 'timeout' | 'general-error' | 'mention-cap' | 'already-in-flight';
  errorMessage: string;
  timestamp: number;
  orderPosition: number;
}

export interface WakeSuccessEvent {
  kind: 'success';
  wakeId?: string;
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  streaming: boolean;
  timestamp: number;
}

export interface WakeChainCancelledEvent {
  kind: 'chain-cancelled';
  chainId: string;
  roomId?: string;
  initiatorAgentId?: string;
  cancelledWakeId?: string;
  skippedAgentIds: string[];
  timestamp: number;
}

export interface WakeDepthExceededEvent {
  kind: 'depth-exceeded';
  wakeId: string;
  chainId?: string;
  parentWakeId?: string;
  roomId?: string;
  initiatorAgentId: string;
  targetAgentId: string;
  depth: number;
  maxDepth: number;
  timestamp: number;
}

export interface WakeBudgetExceededEvent {
  kind: 'budget-exceeded';
  chainId: string;
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  budget: number;
  timestamp: number;
}

/**
 * A user message reached an agent that already has a wake in flight. It is never dropped:
 * it waits on its own new chain (own budget) and runs right after the wakes listed here.
 */
export interface WakeUserQueuedEvent {
  kind: 'user-queued';
  wakeId: string;
  chainId: string;
  /** Chain the user message came in on (the room fan-out chain), if any. */
  fromChainId?: string;
  targetAgentId: string;
  initiatorAgentId?: string;
  roomId?: string;
  waitingForWakeIds: string[];
  timestamp: number;
}

export type WakeEvent = WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent | WakeBackpressureEvent | WakeCancelledEvent | WakeStartedEvent | WakeOrderSkipEvent | WakeSuccessEvent | WakeChainCancelledEvent | WakeDepthExceededEvent | WakeBudgetExceededEvent | WakeUserQueuedEvent;

export type WakeEventCallback = (event: WakeEvent) => void;

export interface AgentProvider {
  id: string;
  name: string;
  sendMessage(message: string, context?: Record<string, unknown>): Promise<string>;
  sendMessageStream?(message: string, context: Record<string, unknown> | undefined, onChunk: StreamChunkCallback): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface WakeLineage {
  chainId: string;
  depth: number;
  initiatorAgentId?: string;
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
  private wakeChains = new Map<string, {
    cancelled: boolean;
    running: number;
    currentWakeIds: Set<string>;
    remainingByLoop: Map<number, string[]>;
    roomId?: string;
    initiatorAgentId?: string;
  }>();
  private wakeLoopCounter = 0;
  /** Main-process-only lineage per wake, kept after the wake ends. Never read from the renderer. */
  private wakeLineage = new Map<string, WakeLineage>();
  private cancelledChains = new Set<string>();
  private depthExceededChains = new Set<string>();
  /** Per-chain cost guard, main process only: total wakes started and agents in flight. */
  private chainBudget = new Map<string, { wakes: number; exceeded: boolean; inFlight: Set<string> }>();
  static readonly MAX_CHAIN_WAKES = 8;
  static readonly MAX_MENTIONS_PER_REPLY = 3;
  /** requestAgentWake without a known parent chain joins the initiator's live root chain. */
  private requestRootChains = new Map<string, string>();
  /** requestAgentWake targets per chain and per parent wake (mention cap for bot-requested wakes). */
  private requestTargets = new Map<string, Map<string, Set<string>>>();
  private wakeChainCounter = 0;
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
    /** Bot-to-bot hop count. Root wakes are 1; missing means 1. */
    depth?: number;
  }> = new Map();
  private wakeIdCounter: number = 0;
  static readonly MAX_WAKE_DEPTH = 4;
  /**
   * Per agent: what is running on it right now (any chain), keyed by wakeId, plus user messages
   * already waiting for it (`queued:<wakeId>`). A new user message waits for exactly this snapshot.
   */
  private agentActivity = new Map<string, Map<string, Promise<void>>>();
  /** User messages waiting for their agent; cancelWake/cancelWakeChain reach them here. */
  private userQueued = new Map<string, { targetAgentId: string; chainId: string; initiatorAgentId?: string; roomId?: string; cancel: () => void }>();

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

    const primary = context?.skipWakeFanOut
      ? await this.sendMessage(message, agentId, context)
      : await this.runUserTurn(
          agentId,
          (context?.room as string | undefined) || (context?.roomId as string | undefined),
          this.generateWakeId(agentId),
          () => this.sendMessage(message, agentId, context)
        );
    primary.agentId = agentId;
    primary.agentName = primaryAgent.name;
    primary.agentAvatar = primaryAgent.avatar;

    const mentionedAgentIds = this.extractMentions(message);
    const wokeAgents = mentionedAgentIds.filter((id) => id !== agentId);

    if (wokeAgents.length > 0 && onWakeResponse && !context?.skipWakeFanOut) {
      const roomId = context?.room as string | undefined || context?.roomId as string | undefined;
      
      wokeAgents.forEach((wokeAgentId) => {
        const wakeId = this.generateWakeId(wokeAgentId, agentId, roomId);
        if (roomId) {
          const { RoomManager } = require('./rooms');
          const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;
          
          if (!roomManagerInstance) {
            this.emitWakeEvent({
              wakeId,
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
              wakeId,
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
              wakeId,
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
        }
        
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
            this.emitWakeEvent({
              kind: 'success',
              wakeId,
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              streaming: false,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.error(`Failed to wake agent ${wokeAgentId}:`, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            // Cancel → wake-cancelled only; timeout → wake-timeout (timeoutMs) only.
            if (
              errorMessage.includes('cancelled') ||
              errorMessage.includes('Wake cancelled') ||
              errorMessage.includes('Wake timeout')
            ) {
              return;
            }
            let reason: WakeFailureReason = 'general-error';
            if (errorMessage.includes('not found')) {
              reason = 'agent-not-found';
            } else if (errorMessage.includes('Provider not found')) {
              reason = 'provider-not-found';
            } else if (errorMessage.includes('not available')) {
              reason = 'provider-unavailable';
            }
            this.emitWakeEvent({
              wakeId,
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
    const roomId = context?.room as string | undefined || context?.roomId as string | undefined;
    // Room fan-out uses this method with the target as primary — mint its wakeId up front so a
    // failure before the first chunk still carries it (Remy #58 soft for #59).
    // Ordered fan-out (`skipWakeFanOut`) already registered its own wakeId.
    const primaryWakeId: string | undefined =
      roomId && !context?.skipWakeFanOut
        ? `wake-${Date.now()}-${agentId}-${Math.random().toString(36).slice(2, 9)}`
        : undefined;
    try {
      await this.streamPrimaryWithWakes(message, agentId, context, roomId, primaryWakeId, onPrimaryChunk, onWakeChunk);
    } catch (err) {
      if (primaryWakeId && err instanceof Error) {
        (err as Error & { wakeId?: string }).wakeId = primaryWakeId;
      }
      throw err;
    }
  }

  private async streamPrimaryWithWakes(
    message: string,
    agentId: string,
    context: Record<string, unknown> | undefined,
    roomId: string | undefined,
    primaryWakeId: string | undefined,
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

    const runPrimary = async (queuedChainId?: string): Promise<void> => {
    // Register the pre-minted primary wakeId so Square can cancel it.
    if (primaryWakeId) {
      this.activeWakeIds.set(primaryWakeId, {
        targetAgentId: agentId,
        initiatorAgentId: undefined,
        roomId,
        cancelled: false,
      });
      this.emitWakeEvent({
        kind: 'started',
        wakeId: primaryWakeId,
        chainId: queuedChainId,
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
    };

    if (context?.skipWakeFanOut) {
      // Ordered fan-out target: already queued and tracked by enqueueWake.
      await runPrimary();
    } else {
      // A user message: if the agent is busy it waits on its own chain, never dropped.
      const turnKey = primaryWakeId ?? this.generateWakeId(agentId, undefined, roomId);
      await this.runUserTurn(agentId, roomId, turnKey, runPrimary);
    }

    const mentionedAgentIds = this.extractMentions(message);
    const wokeAgents = mentionedAgentIds.filter((id) => id !== agentId);

    if (wokeAgents.length > 0 && onWakeChunk && !context?.skipWakeFanOut) {
      wokeAgents.forEach((wokeAgentId) => {
        const wakeId = this.generateWakeId(wokeAgentId, agentId, roomId);
        if (roomId) {
          const { RoomManager } = require('./rooms');
          const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;
          
          if (!roomManagerInstance) {
            this.emitWakeEvent({
              wakeId,
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
              wakeId,
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
              wakeId,
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            return;
          }
        }
        
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
            this.emitWakeEvent({
              kind: 'success',
              wakeId,
              roomId,
              initiatorAgentId: agentId,
              targetAgentId: wokeAgentId,
              streaming: true,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.error(`Failed to wake agent ${wokeAgentId}:`, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            // Cancel → wake-cancelled only; timeout → wake-timeout (timeoutMs) only.
            if (
              errorMessage.includes('cancelled') ||
              errorMessage.includes('Wake cancelled') ||
              errorMessage.includes('Wake timeout')
            ) {
              return;
            }
            let reason: WakeFailureReason = 'general-error';
            if (errorMessage.includes('not found')) {
              reason = 'agent-not-found';
            } else if (errorMessage.includes('Provider not found')) {
              reason = 'provider-not-found';
            } else if (errorMessage.includes('not available')) {
              reason = 'provider-unavailable';
            }
            this.emitWakeEvent({
              wakeId,
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
    // Once wake-timeout fired the wake is over for the UI: drop any later chunk,
    // including done:true, so a slow provider cannot stream into a closed slot (Remy #58 soft 1).
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        this.emitWakeEvent({
          wakeId,
          targetAgentId: wokeAgentId,
          initiatorAgentId: wakerId,
          timeoutMs: 5000,
          timestamp: Date.now(),
        });
        reject(new Error('Wake timeout'));
      }, 5000);
    });
    const guardedOnChunk: typeof onChunk = (id, chunk, done, wId) => {
      if (timedOut) return;
      onChunk(id, chunk, done, wId);
    };

    const wakePromise = this._wakeAgentStreamInternal(wokeAgentId, originalMessage, wakerId, guardedOnChunk, wakeId);
    // The losing wake promise may still reject later; keep that from surfacing as unhandled.
    wakePromise.catch(() => {});

    try {
      await Promise.race([wakePromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
    roomId?: string,
    parentWakeId?: string
  ): Promise<{ wakeId: string }> {
    // Mint early so pre-start failures still carry wakeId for Square attribution.
    const earlyWakeId = this.generateWakeId(targetAgentId, initiatorAgentId, roomId);

    // Depth guard: the bus derives the parent itself. A caller-supplied parent can only
    // raise the depth, never lower it, so omitting it does not reset the chain to 0.
    const { depth, parent } = this.resolveWakeDepth(initiatorAgentId, parentWakeId);
    const parentChainId = parent ? this.wakeLineage.get(parent)?.chainId : undefined;
    if (depth > AgentBus.MAX_WAKE_DEPTH) {
      this.emitWakeEvent({
        kind: 'depth-exceeded',
        wakeId: earlyWakeId,
        chainId: parentChainId,
        parentWakeId: parent,
        roomId,
        initiatorAgentId,
        targetAgentId,
        depth,
        maxDepth: AgentBus.MAX_WAKE_DEPTH,
        timestamp: Date.now(),
      });
      throw new Error(`Wake depth exceeded (${depth} > ${AgentBus.MAX_WAKE_DEPTH})`);
    }

    const initiator = this.agents.get(initiatorAgentId);
    if (!initiator) {
      const error = new Error(`Initiator agent not found: ${initiatorAgentId}`);
      this.emitWakeEvent({
        wakeId: earlyWakeId,
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
        wakeId: earlyWakeId,
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
          wakeId: earlyWakeId,
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
          wakeId: earlyWakeId,
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
    const wakeId = earlyWakeId;

    // One budget for every bot-triggered wake: same chain budget (8), in-flight dedupe and
    // mention cap (3 targets per parent) as reply @mentions (Remy #57 soft 1).
    const chainId = parentChainId ?? this.requestRootChain(initiatorAgentId, roomId);
    const chain = this.ensureChain(chainId, roomId, initiatorAgentId);
    if (chain.cancelled || this.cancelledChains.has(chainId)) {
      throw new Error(`Wake chain cancelled: ${chainId}`);
    }
    const budget = this.getChainBudget(chainId);
    const skip = (reason: WakeOrderSkipEvent['reason'], errorMessage: string): never => {
      this.emitWakeEvent({
        kind: 'order-skip',
        wakeId,
        roomId,
        initiatorAgentId,
        targetAgentId,
        reason,
        errorMessage,
        timestamp: Date.now(),
        orderPosition: -1,
      });
      throw new Error(errorMessage);
    };
    if (budget.inFlight.has(targetAgentId)) {
      skip('already-in-flight', `Agent ${targetAgentId} is already running in this chain`);
    }
    let perChain = this.requestTargets.get(chainId);
    if (!perChain) { perChain = new Map(); this.requestTargets.set(chainId, perChain); }
    const capKey = parent ?? `root:${initiatorAgentId}`;
    let targetsForParent = perChain.get(capKey);
    if (!targetsForParent) { targetsForParent = new Set(); perChain.set(capKey, targetsForParent); }
    if (!targetsForParent.has(targetAgentId) && targetsForParent.size >= AgentBus.MAX_MENTIONS_PER_REPLY) {
      skip('mention-cap', `Only ${AgentBus.MAX_MENTIONS_PER_REPLY} mentions per reply wake agents`);
    }
    if (budget.wakes >= AgentBus.MAX_CHAIN_WAKES) {
      if (!budget.exceeded) {
        budget.exceeded = true;
        this.emitWakeEvent({
          kind: 'budget-exceeded',
          chainId,
          roomId,
          initiatorAgentId,
          targetAgentId,
          budget: AgentBus.MAX_CHAIN_WAKES,
          timestamp: Date.now(),
        });
      }
      throw new Error(`Wake budget exceeded for chain ${chainId}`);
    }
    budget.wakes++;
    budget.inFlight.add(targetAgentId);
    targetsForParent.add(targetAgentId);
    chain.running++;
    chain.currentWakeIds.add(wakeId);
    this.rememberLineage(wakeId, { chainId, depth, initiatorAgentId });
    let released = false;
    const releaseChain = () => {
      if (released) return;
      released = true;
      budget.inFlight.delete(targetAgentId);
      chain.currentWakeIds.delete(wakeId);
      chain.running--;
      if (chain.running <= 0) this.endChain(chainId);
    };

    this.activeWakeIds.set(wakeId, {
      targetAgentId,
      initiatorAgentId,
      roomId,
      cancelled: false,
      depth,
    });
    this.emitWakeEvent({
      kind: 'started',
      wakeId,
      chainId,
      targetAgentId,
      initiatorAgentId,
      roomId,
      timestamp: Date.now(),
    });
    
    const wakeFn = async () => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          this.emitWakeEvent({
            wakeId,
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
        this.emitWakeEvent({
          kind: 'success',
          wakeId,
          roomId,
          initiatorAgentId,
          targetAgentId,
          streaming: false,
          timestamp: Date.now(),
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (errorMessage.includes('cancelled') || errorMessage.includes('Wake cancelled')) {
          // wake-cancelled already emitted
        } else if (!errorMessage.includes('Wake timeout')) {
          let reason: WakeFailureReason = 'general-error';
          if (errorMessage.includes('not found')) {
            reason = 'agent-not-found';
          } else if (errorMessage.includes('Provider not found')) {
            reason = 'provider-not-found';
          } else if (errorMessage.includes('not available')) {
            reason = 'provider-unavailable';
          }
          this.emitWakeEvent({
            wakeId,
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
        releaseChain();
      }
    };

    // Soft (Remy): return wakeId immediately; do not await wake completion.
    void this.enqueueWake(targetAgentId, wakeFn, wakeId, initiatorAgentId, roomId).catch(() => {
      // Rejected before wakeFn ran (queue full / cancelled while queued): free the slot here.
      this.activeWakeIds.delete(wakeId);
      releaseChain();
    });
    return { wakeId };
  }

  /** Mentioned agent ids in the order they appear in the text. */
  private extractMentionsInOrder(message: string): string[] {
    const ids: string[] = [];
    for (const m of message.matchAll(/@(\w+)/g)) {
      const name = m[1].toLowerCase();
      for (const agent of this.agents.values()) {
        if (agent.name.toLowerCase() === name) ids.push(agent.id);
      }
    }
    return ids;
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
          wakeId,
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

  private emitWakeEvent(event: WakeEvent): void {
    if ('errorMessage' in event && typeof event.errorMessage === 'string') {
      event = { ...event, errorMessage: sanitizeErrorMessage(event.errorMessage) };
    }
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
        await this.trackAgentRun(targetAgentId, finalWakeId, wakeFn());
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
              wakeId: droppedWake.wakeId,
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
        this.trackAgentRun(next.targetAgentId, next.wakeId, next.fn())
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
    onChunk?: (wakeId: string, agentId: string, chunk: string, done: boolean, lineage?: WakeLineage) => void,
    onComplete?: (wakeId: string, agentId: string, message: AgentBusMessage, lineage?: WakeLineage) => void,
    chainId: string = this.createWakeChainId(),
    depth: number = 1,
    opts: { userMessage?: boolean; queuedFrom?: string } = {}
  ): Promise<void> {
    if (this.cancelledChains.has(chainId)) return;
    // Targets the user addressed directly (depth 1). Reply mentions are bot-triggered (depth > 1).
    const userTurn = opts.userMessage === true && depth === 1;
    const chain = this.ensureChain(chainId, roomId, initiatorAgentId);
    chain.running++;
    const loopId = this.wakeLoopCounter++;
    chain.remainingByLoop.set(loopId, targets.map((t) => t.agentId));
    try {
    for (let orderPosition = 0; orderPosition < targets.length; orderPosition++) {
      const target = targets[orderPosition];
      // Chain cancel: stop before starting the next target.
      if (chain.cancelled) break;
      chain.remainingByLoop.set(loopId, targets.slice(orderPosition + 1).map((t) => t.agentId));
      const wakeId = this.generateWakeId(target.agentId, initiatorAgentId, roomId);

      // Depth guard for reply-driven chains: never run past MAX_WAKE_DEPTH.
      if (depth > AgentBus.MAX_WAKE_DEPTH) {
        if (!this.depthExceededChains.has(chainId)) {
          this.depthExceededChains.add(chainId);
          this.emitWakeEvent({
            kind: 'depth-exceeded',
            wakeId,
            chainId,
            roomId,
            initiatorAgentId: initiatorAgentId || 'system',
            targetAgentId: target.agentId,
            depth,
            maxDepth: AgentBus.MAX_WAKE_DEPTH,
            timestamp: Date.now(),
          });
        }
        continue;
      }

      const budget = this.getChainBudget(chainId);
      // A user message is never dropped as already-in-flight. If the agent is busy (any chain),
      // it waits on its own new chain with its own budget and runs right after the current wake.
      if (userTurn && !opts.queuedFrom && (this.isAgentBusy(target.agentId) || budget.inFlight.has(target.agentId))) {
        await this.enqueueOrderedWakes(
          [target], initiatorAgentId, roomId, onChunk, onComplete,
          this.createWakeChainId(), 1, { userMessage: true, queuedFrom: chainId }
        );
        continue;
      }
      // Dedupe only parallel duplicates of bot-triggered wakes; sequential back-and-forth is bounded by depth + budget.
      if (!userTurn && budget.inFlight.has(target.agentId)) {
        this.emitWakeEvent({
          kind: 'order-skip',
          wakeId,
          roomId,
          initiatorAgentId,
          targetAgentId: target.agentId,
          reason: 'already-in-flight',
          errorMessage: `Agent ${target.agentId} is already running in this chain`,
          timestamp: Date.now(),
          orderPosition,
        });
        continue;
      }
      if (budget.wakes >= AgentBus.MAX_CHAIN_WAKES) {
        if (!budget.exceeded) {
          budget.exceeded = true;
          this.emitWakeEvent({
            kind: 'budget-exceeded',
            chainId,
            roomId,
            initiatorAgentId,
            targetAgentId: target.agentId,
            budget: AgentBus.MAX_CHAIN_WAKES,
            timestamp: Date.now(),
          });
        }
        continue;
      }
      budget.wakes++;
      budget.inFlight.add(target.agentId);

      const lineage: WakeLineage = { chainId, depth, initiatorAgentId };
      this.rememberLineage(wakeId, lineage);
      chain.currentWakeIds.add(wakeId);
      let replyContent = '';

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

      // A target refused before it starts costs no budget and is not in flight.
      const releaseUnstarted = () => {
        budget.wakes--;
        budget.inFlight.delete(target.agentId);
        chain.currentWakeIds.delete(wakeId);
      };

      let finishUserTurn: (() => void) | undefined;
      try {
        if (roomId) {
          const { RoomManager } = require('./rooms');
          const roomManagerInstance = global.roomManager as InstanceType<typeof RoomManager> | undefined;

          if (!roomManagerInstance) {
            this.emitWakeEvent({
              wakeId,
              roomId,
              initiatorAgentId: initiatorAgentId || 'system',
              targetAgentId: target.agentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            // One signal only: wake-membership-denied. No extra order-skip.
            releaseUnstarted();
            continue;
          }

          const room = roomManagerInstance.getRoom(roomId);
          if (!room) {
            this.emitWakeEvent({
              wakeId,
              roomId,
              initiatorAgentId: initiatorAgentId || 'system',
              targetAgentId: target.agentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            // One signal only: wake-membership-denied. No extra order-skip.
            releaseUnstarted();
            continue;
          }

          if (!room.memberAgentIds.includes(target.agentId)) {
            this.emitWakeEvent({
              wakeId,
              roomId,
              initiatorAgentId: initiatorAgentId || 'system',
              targetAgentId: target.agentId,
              denialReason: 'target-not-member',
              timestamp: Date.now(),
            });
            // One signal only: wake-membership-denied. No extra order-skip.
            releaseUnstarted();
            continue;
          }
        }

        if (!this.agents.get(target.agentId)) {
          releaseUnstarted();
          emitSkip('agent-not-found', `Agent not found: ${target.agentId}`);
          continue;
        }

        if (opts.queuedFrom) {
          // Queued user message: refusals above came first; now wait for the agent's current wake.
          finishUserTurn = await this.waitForUserTurn(target.agentId, wakeId, chainId, initiatorAgentId, roomId, opts.queuedFrom);
          if (chain.cancelled) throw new Error('Wake cancelled');
        }

        this.activeWakeIds.set(wakeId, {
          targetAgentId: target.agentId,
          initiatorAgentId,
          roomId,
          cancelled: false,
          depth,
        });
        this.emitWakeEvent({
          kind: 'started',
          wakeId,
          chainId,
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
                    if (!done) {
                      replyContent += chunk;
                    } else if (chunk) {
                      replyContent = chunk;
                    }
                    onChunk(wakeId, target.agentId, chunk, done, lineage);
                  }
                );
                this.emitWakeEvent({
                  kind: 'success',
                  wakeId,
                  roomId,
                  initiatorAgentId,
                  targetAgentId: target.agentId,
                  streaming: true,
                  timestamp: Date.now(),
                });
              } else {
                const response = await this.sendMessage(target.message, target.agentId, context);
                // Cancelled while the provider call was in flight: drop the late reply.
                if (this.activeWakeIds.get(wakeId)?.cancelled) {
                  throw new Error('Wake cancelled');
                }
                replyContent = response.content;
                if (onComplete) {
                  onComplete(wakeId, target.agentId, response, lineage);
                }
                this.emitWakeEvent({
                  kind: 'success',
                  wakeId,
                  roomId,
                  initiatorAgentId,
                  targetAgentId: target.agentId,
                  streaming: false,
                  timestamp: Date.now(),
                });
              }
            } finally {
              this.activeWakeIds.delete(wakeId);
            }
          },
          wakeId,
          initiatorAgentId,
          roomId
        );
        chain.currentWakeIds.delete(wakeId);
        budget.inFlight.delete(target.agentId);
        this.fanOutReplyMentions(replyContent, target.agentId, roomId, chainId, depth, onChunk, onComplete);
      } catch (err) {
        chain.currentWakeIds.delete(wakeId);
        budget.inFlight.delete(target.agentId);
        console.error(`Ordered wake failed for ${target.agentId} (position ${orderPosition}):`, err);
        this.activeWakeIds.delete(wakeId);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (
          errorMessage.includes('cancelled') ||
          errorMessage.includes('Wake cancelled') ||
          errorMessage.includes('Wake timeout')
        ) {
          // wake-cancelled / wake-timeout already emitted — no dual order-skip
          continue;
        }
        let reason: WakeOrderSkipEvent['reason'] = 'general-error';
        if (errorMessage.includes('not found') || errorMessage.includes('Agent not found')) {
          reason = 'agent-not-found';
        } else if (errorMessage.includes('member')) {
          reason = 'membership-denied';
        }
        emitSkip(reason, errorMessage);
      } finally {
        finishUserTurn?.();
      }
    }
    } finally {
      chain.remainingByLoop.delete(loopId);
      chain.running--;
      if (chain.running <= 0) this.endChain(chainId);
    }
  }

  /** Record a running wake on its agent until it settles. Returns the same promise. */
  private trackAgentRun<T>(agentId: string, key: string, run: Promise<T>): Promise<T> {
    let m = this.agentActivity.get(agentId);
    if (!m) { m = new Map(); this.agentActivity.set(agentId, m); }
    const settled = run.then(() => undefined, () => undefined);
    m.set(key, settled);
    void settled.then(() => {
      const cur = this.agentActivity.get(agentId);
      if (cur && cur.get(key) === settled) {
        cur.delete(key);
        if (cur.size === 0) this.agentActivity.delete(agentId);
      }
    });
    return run;
  }

  /** True when the agent has a wake running or a user message already waiting for it. */
  isAgentBusy(agentId: string): boolean {
    return (this.agentActivity.get(agentId)?.size ?? 0) > 0;
  }

  /**
   * Run a direct user message (DM or room primary). Idle agent: runs now. Busy agent: waits on a
   * fresh chain with its own budget (1 wake), outside any bot chain, then runs.
   */
  private async runUserTurn<T>(
    agentId: string,
    roomId: string | undefined,
    turnKey: string,
    run: (queuedChainId?: string) => Promise<T>
  ): Promise<T> {
    if (!this.isAgentBusy(agentId)) {
      return this.trackAgentRun(agentId, turnKey, run());
    }
    const chainId = this.createWakeChainId();
    const chain = this.ensureChain(chainId, roomId);
    const budget = this.getChainBudget(chainId);
    chain.running++;
    chain.currentWakeIds.add(turnKey);
    budget.wakes++;
    budget.inFlight.add(agentId);
    this.rememberLineage(turnKey, { chainId, depth: 1 });
    let finish: (() => void) | undefined;
    try {
      finish = await this.waitForUserTurn(agentId, turnKey, chainId, undefined, roomId, undefined);
      if (chain.cancelled) throw new Error('Wake cancelled');
      return await this.trackAgentRun(agentId, turnKey, run(chainId));
    } finally {
      finish?.();
      budget.inFlight.delete(agentId);
      chain.currentWakeIds.delete(turnKey);
      chain.running--;
      if (chain.running <= 0) this.endChain(chainId);
    }
  }

  /** Snapshot of user messages waiting for their agent (harness / metrics). */
  getQueuedUserWakes(): Array<{ wakeId: string; targetAgentId: string; chainId: string }> {
    return Array.from(this.userQueued, ([wakeId, q]) => ({ wakeId, targetAgentId: q.targetAgentId, chainId: q.chainId }));
  }

  /**
   * A user message to a busy agent: wait on its own chain until everything that is on the agent
   * right now has finished, then run. Rejects with 'Wake cancelled' if cancelled while waiting.
   * Bot-triggered wakes never come through here; their dedupe stays per chain.
   */
  private async waitForUserTurn(
    targetAgentId: string,
    wakeId: string,
    chainId: string,
    initiatorAgentId: string | undefined,
    roomId: string | undefined,
    fromChainId: string | undefined
  ): Promise<() => void> {
    const ahead = new Map(this.agentActivity.get(targetAgentId) ?? []);
    let finish!: () => void;
    const turnDone = new Promise<void>((r) => { finish = r; });
    this.trackAgentRun(targetAgentId, `queued:${wakeId}`, turnDone);
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error('Wake cancelled')); });
    cancelled.catch(() => undefined);
    this.userQueued.set(wakeId, { targetAgentId, chainId, initiatorAgentId, roomId, cancel });
    this.emitWakeEvent({
      kind: 'user-queued',
      wakeId,
      chainId,
      fromChainId,
      targetAgentId,
      initiatorAgentId,
      roomId,
      waitingForWakeIds: Array.from(ahead.keys()).map((k) => k.replace(/^queued:/, '')),
      timestamp: Date.now(),
    });
    try {
      await Promise.race([Promise.all(ahead.values()), cancelled]);
    } catch (err) {
      finish();
      throw err;
    } finally {
      this.userQueued.delete(wakeId);
    }
    return finish;
  }

  private ensureChain(chainId: string, roomId?: string, initiatorAgentId?: string) {
    let chain = this.wakeChains.get(chainId);
    if (!chain) {
      chain = {
        cancelled: false,
        running: 0,
        currentWakeIds: new Set<string>(),
        remainingByLoop: new Map<number, string[]>(),
        roomId,
        initiatorAgentId,
      };
      this.wakeChains.set(chainId, chain);
    }
    return chain;
  }

  /** Chain is over (all loops, reply fan-out and requested wakes finished): free its guards. */
  private endChain(chainId: string): void {
    this.wakeChains.delete(chainId);
    this.chainBudget.delete(chainId);
    this.depthExceededChains.delete(chainId);
    this.cancelledChains.delete(chainId);
    this.requestTargets.delete(chainId);
    for (const [key, id] of this.requestRootChains) {
      if (id === chainId) this.requestRootChains.delete(key);
    }
  }

  /** Live root chain for bot-requested wakes of one initiator in one room/DM. */
  private requestRootChain(initiatorAgentId: string, roomId?: string): string {
    const key = `${initiatorAgentId}|${roomId ?? ''}`;
    const existing = this.requestRootChains.get(key);
    if (existing && this.wakeChains.has(existing)) return existing;
    const chainId = this.createWakeChainId();
    this.requestRootChains.set(key, chainId);
    return chainId;
  }

  private getChainBudget(chainId: string): { wakes: number; exceeded: boolean; inFlight: Set<string> } {
    let b = this.chainBudget.get(chainId);
    if (!b) {
      b = { wakes: 0, exceeded: false, inFlight: new Set<string>() };
      this.chainBudget.set(chainId, b);
      if (this.chainBudget.size > 500) {
        const oldest = this.chainBudget.keys().next().value;
        if (oldest !== undefined) this.chainBudget.delete(oldest);
      }
    }
    return b;
  }

  /** Read-only budget snapshot for a chain (for harness and metrics). */
  getChainWakeCount(chainId: string): number {
    return this.chainBudget.get(chainId)?.wakes ?? 0;
  }

  private rememberLineage(wakeId: string, lineage: WakeLineage): void {
    this.wakeLineage.set(wakeId, lineage);
    if (this.wakeLineage.size > 1000) {
      const oldest = this.wakeLineage.keys().next().value;
      if (oldest !== undefined) this.wakeLineage.delete(oldest);
    }
  }

  /** Main-process lineage for a wake (survives the wake ending). */
  getWakeLineage(wakeId: string): WakeLineage | undefined {
    return this.wakeLineage.get(wakeId);
  }

  /**
   * A finished reply that @mentions other agents wakes them in the same chain at depth + 1.
   * Lineage comes from the bus's own record of the parent wake, never from the renderer.
   * Self-mentions are ignored; membership is enforced by enqueueOrderedWakes.
   */
  private fanOutReplyMentions(
    replyContent: string,
    replyingAgentId: string,
    roomId: string | undefined,
    chainId: string,
    parentDepth: number,
    onChunk?: (wakeId: string, agentId: string, chunk: string, done: boolean, lineage?: WakeLineage) => void,
    onComplete?: (wakeId: string, agentId: string, message: AgentBusMessage, lineage?: WakeLineage) => void
  ): void {
    if (!replyContent || this.cancelledChains.has(chainId)) return;
    const mentioned = Array.from(new Set(this.extractMentionsInOrder(replyContent)))
      .filter((id) => id !== replyingAgentId);
    const capped = mentioned.slice(AgentBus.MAX_MENTIONS_PER_REPLY);
    for (const agentId of capped) {
      this.emitWakeEvent({
        kind: 'order-skip',
        wakeId: this.generateWakeId(agentId, replyingAgentId, roomId),
        roomId,
        initiatorAgentId: replyingAgentId,
        targetAgentId: agentId,
        reason: 'mention-cap',
        errorMessage: `Only ${AgentBus.MAX_MENTIONS_PER_REPLY} mentions per reply wake agents`,
        timestamp: Date.now(),
        orderPosition: -1,
      });
    }
    const targets = mentioned
      .slice(0, AgentBus.MAX_MENTIONS_PER_REPLY)
      .map((agentId) => ({ agentId, message: replyContent }));
    if (targets.length === 0) return;
    void this.enqueueOrderedWakes(targets, replyingAgentId, roomId, onChunk, onComplete, chainId, parentDepth + 1)
      .catch((err) => console.error(`Reply mention fan-out failed in chain ${chainId}:`, err));
  }

  /** Deepest active wake that targets the initiator, plus an optional caller hint. */
  private resolveWakeDepth(initiatorAgentId: string, parentWakeId?: string): { depth: number; parent?: string } {
    let parentDepth = 0;
    let parent: string | undefined;
    for (const [id, w] of this.activeWakeIds) {
      if (w.cancelled || w.targetAgentId !== initiatorAgentId) continue;
      const d = w.depth ?? 1;
      if (d > parentDepth) { parentDepth = d; parent = id; }
    }
    if (parentWakeId) {
      const hinted = this.activeWakeIds.get(parentWakeId);
      const d = hinted ? (hinted.depth ?? 1) : 0;
      if (d > parentDepth) { parentDepth = d; parent = parentWakeId; }
    }
    return { depth: parentDepth + 1, parent };
  }

  createWakeChainId(): string {
    return `chain-${Date.now()}-${this.wakeChainCounter++}`;
  }

  /**
   * Cancel a whole ordered wake chain: the in-flight wake is cancelled (wake-cancelled)
   * and no later target starts. Emits one chain-cancelled with the skipped targets.
   */
  cancelWakeChain(chainId: string): { cancelled: boolean; cancelledWakeId?: string; skippedAgentIds: string[] } {
    const chain = this.wakeChains.get(chainId);
    if (!chain || chain.cancelled || this.cancelledChains.has(chainId)) {
      return { cancelled: false, skippedAgentIds: [] };
    }
    chain.cancelled = true;
    // Persist so reply-driven wakes spawned later in this chain never start.
    this.cancelledChains.add(chainId);
    const skippedAgentIds = Array.from(chain.remainingByLoop.values()).flat();
    const inFlight = Array.from(chain.currentWakeIds);
    for (const id of inFlight) this.cancelWake(id);
    const cancelledWakeId = inFlight[0];
    this.emitWakeEvent({
      kind: 'chain-cancelled',
      chainId,
      roomId: chain.roomId,
      initiatorAgentId: chain.initiatorAgentId,
      cancelledWakeId,
      skippedAgentIds,
      timestamp: Date.now(),
    });
    return { cancelled: true, cancelledWakeId, skippedAgentIds };
  }


  cancelWake(wakeId: string): { cancelled: boolean; wasActive: boolean; wasQueued: boolean } {
    // A user message still waiting for its agent.
    const userWaiting = this.userQueued.get(wakeId);
    if (userWaiting) {
      this.userQueued.delete(wakeId);
      this.emitWakeEvent({
        kind: 'cancelled',
        wakeId,
        targetAgentId: userWaiting.targetAgentId,
        initiatorAgentId: userWaiting.initiatorAgentId,
        roomId: userWaiting.roomId,
        timestamp: Date.now(),
      });
      userWaiting.cancel();
      return { cancelled: true, wasActive: false, wasQueued: true };
    }
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
