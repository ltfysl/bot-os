export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  path?: string;
  data?: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
  targetAgentId?: string;
  attachments?: Attachment[];
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
  attachments?: Attachment[];
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

declare global {
  interface Window {
    electronAPI: {
      sendMessage: (agentId: string, message: string, attachments?: Attachment[]) => Promise<Message>;
      sendMessageStream: (agentId: string, message: string, attachments?: Attachment[]) => Promise<StreamResponse>;
      onMessageStreamChunk: (callback: (chunk: StreamChunk) => void) => (() => void);
      onWakeStreamChunk: (callback: (chunk: StreamChunk) => void) => (() => void);
      onMessageStreamError: (callback: (error: { id: string; agentId: string; error: string }) => void) => (() => void);
      onWakeResponse: (callback: (message: Message) => void) => (() => void);
      requestAgentWake: (initiatorAgentId: string, targetAgentId: string, message: string, roomId?: string) => Promise<WakeResult>;
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
      setProviderSecret: (providerId: string, secretName: string, value: string) => Promise<SetSecretResult>;
      clearProviderSecret: (providerId: string, secretName: string) => Promise<ClearSecretResult>;
      listRooms: () => Promise<Room[]>;
      createRoom: (name: string, memberAgentIds: string[]) => Promise<Room>;
      getRoom: (roomId: string) => Promise<Room | undefined>;
      updateRoom: (roomId: string, updates: Partial<Omit<Room, 'id'>>) => Promise<Room | undefined>;
      deleteRoom: (roomId: string) => Promise<boolean>;
      getRoomMessages: (roomId: string) => Promise<RoomMessage[]>;
      sendRoomMessage: (roomId: string, content: string, senderId?: string, attachments?: Attachment[]) => Promise<RoomMessage>;
      sendRoomMessageStream: (roomId: string, content: string, senderId?: string, attachments?: Attachment[]) => Promise<RoomMessage>;
      onRoomStreamChunk: (callback: (chunk: RoomStreamChunk) => void) => (() => void);
      clearRoomUnread: (roomId: string) => Promise<{ success: boolean }>;
      onRoomFanInResponse: (callback: (message: RoomMessage) => void) => (() => void);
      onWidgetRequest: (callback: (request: WidgetRequest) => void) => (() => void);
      respondToWidget: (response: WidgetResponse) => Promise<void>;
      pickFiles: (options?: { multiple?: boolean }) => Promise<Attachment[]>;
    };
  }
}
