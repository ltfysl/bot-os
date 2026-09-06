import { contextBridge, ipcRenderer } from 'electron';

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

export interface SetSecretResult {
  ok: boolean;
  error?: string;
}

export interface ClearSecretResult {
  ok: boolean;
  cleared?: boolean;
  error?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (agentId: string, message: string): Promise<Message> =>
    ipcRenderer.invoke('send-message', agentId, message),
  onWakeResponse: (callback: (message: Message) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: Message) => callback(message);
    ipcRenderer.on('wake-response', handler);
    return () => ipcRenderer.removeListener('wake-response', handler);
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
  listRoutines: (): Promise<Routine[]> => ipcRenderer.invoke('list-routines'),
  createRoutine: (input: RoutineCreateInput): Promise<Routine> =>
    ipcRenderer.invoke('create-routine', input),
  updateRoutine: (id: string, input: RoutineUpdateInput): Promise<Routine> =>
    ipcRenderer.invoke('update-routine', id, input),
  setRoutineEnabled: (id: string, enabled: boolean): Promise<Routine> =>
    ipcRenderer.invoke('set-routine-enabled', id, enabled),
  deleteRoutine: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('delete-routine', id),
  setProviderSecret: (providerId: string, secretName: string, value: string): Promise<SetSecretResult> =>
    ipcRenderer.invoke('set-provider-secret', providerId, secretName, value),
  clearProviderSecret: (providerId: string, secretName: string): Promise<ClearSecretResult> =>
    ipcRenderer.invoke('clear-provider-secret', providerId, secretName),
});
