import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string): Promise<Message> =>
    ipcRenderer.invoke('send-message', message),
  getChannels: (): Promise<Channel[]> => ipcRenderer.invoke('get-channels'),
  getAgents: (): Promise<Agent[]> => ipcRenderer.invoke('get-agents'),
});
