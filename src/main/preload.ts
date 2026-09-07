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

export interface StreamChunk {
  id: string;
  agentId: string;
  agentName: string;
  agentAvatar: string;
  chunk: string;
  done: boolean;
  targetAgentId?: string;
}

export interface StreamResponse {
  id: string;
  agentId: string;
  streaming: boolean;
}

export interface WakeResult {
  success: boolean;
  error?: string;
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

export interface Room {
  id: string;
  name: string;
  memberAgentIds: string[];
  unread?: number;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
}

export interface RoomStreamChunk {
  id: string;
  roomId: string;
  agentId: string;
  agentName: string;
  agentAvatar: string;
  chunk: string;
  done: boolean;
}

export type WidgetType = 'single-select' | 'multi-select' | 'danger' | 'allow-custom';

export interface WidgetOption {
  id: string;
  label: string;
}

export interface WidgetRequest {
  id: string;
  type: WidgetType;
  title?: string;
  options: WidgetOption[];
}

export interface WidgetResponse {
  widgetId: string;
  selected: string[];
  customValue?: string;
  dismissed: boolean;
}

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (agentId: string, message: string): Promise<Message> =>
    ipcRenderer.invoke('send-message', agentId, message),
  sendMessageStream: (agentId: string, message: string): Promise<StreamResponse> =>
    ipcRenderer.invoke('send-message-stream', agentId, message),
  onMessageStreamChunk: (callback: (chunk: StreamChunk) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: StreamChunk) => callback(chunk);
    ipcRenderer.on('message-stream-chunk', handler);
    return () => ipcRenderer.removeListener('message-stream-chunk', handler);
  },
  onWakeStreamChunk: (callback: (chunk: StreamChunk) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: StreamChunk) => callback(chunk);
    ipcRenderer.on('wake-stream-chunk', handler);
    return () => ipcRenderer.removeListener('wake-stream-chunk', handler);
  },
  onMessageStreamError: (callback: (error: { id: string; agentId: string; error: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: { id: string; agentId: string; error: string }) => callback(error);
    ipcRenderer.on('message-stream-error', handler);
    return () => ipcRenderer.removeListener('message-stream-error', handler);
  },
  onWakeResponse: (callback: (message: Message) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: Message) => callback(message);
    ipcRenderer.on('wake-response', handler);
    return () => ipcRenderer.removeListener('wake-response', handler);
  },
  requestAgentWake: (initiatorAgentId: string, targetAgentId: string, message: string, roomId?: string): Promise<WakeResult> =>
    ipcRenderer.invoke('request-agent-wake', initiatorAgentId, targetAgentId, message, roomId),
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
  listRooms: (): Promise<Room[]> => ipcRenderer.invoke('list-rooms'),
  createRoom: (name: string, memberAgentIds: string[]): Promise<Room> =>
    ipcRenderer.invoke('create-room', name, memberAgentIds),
  getRoom: (roomId: string): Promise<Room | undefined> =>
    ipcRenderer.invoke('get-room', roomId),
  updateRoom: (roomId: string, updates: Partial<Omit<Room, 'id'>>): Promise<Room | undefined> =>
    ipcRenderer.invoke('update-room', roomId, updates),
  deleteRoom: (roomId: string): Promise<boolean> =>
    ipcRenderer.invoke('delete-room', roomId),
  getRoomMessages: (roomId: string): Promise<RoomMessage[]> =>
    ipcRenderer.invoke('get-room-messages', roomId),
  sendRoomMessage: (roomId: string, content: string, senderId?: string): Promise<RoomMessage> =>
    ipcRenderer.invoke('send-room-message', roomId, content, senderId),
  sendRoomMessageStream: (roomId: string, content: string, senderId?: string): Promise<RoomMessage> =>
    ipcRenderer.invoke('send-room-message-stream', roomId, content, senderId),
  onRoomStreamChunk: (callback: (chunk: RoomStreamChunk) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: RoomStreamChunk) => callback(chunk);
    ipcRenderer.on('room-stream-chunk', handler);
    return () => ipcRenderer.removeListener('room-stream-chunk', handler);
  },
  clearRoomUnread: (roomId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('clear-room-unread', roomId),
  onRoomFanInResponse: (callback: (message: RoomMessage) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: RoomMessage) => callback(message);
    ipcRenderer.on('room-fan-in-response', handler);
    return () => ipcRenderer.removeListener('room-fan-in-response', handler);
  },
  onWidgetRequest: (callback: (request: WidgetRequest) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: WidgetRequest) => callback(request);
    ipcRenderer.on('widget-request', handler);
    return () => ipcRenderer.removeListener('widget-request', handler);
  },
  respondToWidget: (response: WidgetResponse): Promise<void> =>
    ipcRenderer.invoke('respond-to-widget', response),
});
