import { contextBridge, ipcRenderer } from 'electron';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
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

export interface ProviderInfo {
  id: string;
  name: string;
  hasSecret: boolean;
  isAvailable: boolean;
}

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (agentId: string, message: string): Promise<Message> =>
    ipcRenderer.invoke('send-message', agentId, message),
  onWakeResponse: (callback: (message: Message) => void): void => {
    ipcRenderer.on('wake-response', (_event, message: Message) => callback(message));
  },
  getChannels: (): Promise<Channel[]> => ipcRenderer.invoke('get-channels'),
  getAgents: (): Promise<Agent[]> => ipcRenderer.invoke('get-agents'),
  listProviders: (): Promise<ProviderInfo[]> => ipcRenderer.invoke('list-providers'),
  setDefaultProvider: (providerId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('set-default-provider', providerId),
  getDefaultProvider: (): Promise<string | undefined> =>
    ipcRenderer.invoke('get-default-provider'),
  updateAgentProvider: (agentId: string, providerId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('update-agent-provider', agentId, providerId),
});
