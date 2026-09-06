export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
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
  unread?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  hasSecret: boolean;
  isAvailable: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      sendMessage: (agentId: string, message: string) => Promise<Message>;
      getChannels: () => Promise<Channel[]>;
      getAgents: () => Promise<Agent[]>;
      listProviders: () => Promise<ProviderInfo[]>;
      setDefaultProvider: (providerId: string) => Promise<{ success: boolean }>;
      getDefaultProvider: () => Promise<string | undefined>;
      updateAgentProvider: (agentId: string, providerId: string) => Promise<{ success: boolean }>;
    };
  }
}
