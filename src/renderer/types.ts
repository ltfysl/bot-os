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
}

declare global {
  interface Window {
    electronAPI: {
      sendMessage: (message: string) => Promise<Message>;
      getChannels: () => Promise<Channel[]>;
      getAgents: () => Promise<Agent[]>;
    };
  }
}
