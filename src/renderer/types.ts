export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
  targetAgentId?: string;
}

export interface Channel {
  id: string;
  name: string;
  icon: string;
}

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'offline';
  avatar: string;
  providerId?: string;
  unread?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  hasSecret: boolean;
  isAvailable: boolean;
}

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  lastRun?: number;
}

export interface RoutineCreateInput {
  name: string;
  prompt: string;
  schedule: string;
  enabled?: boolean;
}

export interface RoutineUpdateInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      sendMessage: (agentId: string, message: string) => Promise<Message>;
      onWakeResponse: (callback: (message: Message) => void) => (() => void);
      getChannels: () => Promise<Channel[]>;
      getAgents: () => Promise<Agent[]>;
      listProviders: () => Promise<ProviderInfo[]>;
      setDefaultProvider: (providerId: string) => Promise<{ success: boolean }>;
      getDefaultProvider: () => Promise<string | undefined>;
      updateAgentProvider: (agentId: string, providerId: string) => Promise<{ success: boolean }>;
      listRoutines: () => Promise<Routine[]>;
      createRoutine: (input: RoutineCreateInput) => Promise<Routine>;
      updateRoutine: (id: string, input: RoutineUpdateInput) => Promise<Routine>;
      setRoutineEnabled: (id: string, enabled: boolean) => Promise<Routine>;
      deleteRoutine: (id: string) => Promise<boolean>;
    };
  }
}
