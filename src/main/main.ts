import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { AgentBus } from './agent-bus';
import { MockEchoProvider, MockIntelligentProvider } from './providers/mock-providers';
import { MiniMaxProvider } from './providers/minimax-provider';
import { ZaiProvider } from './providers/zai-provider';
import { CodingPlanProvider } from './providers/coding-plan-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { RoutineManager, Routine, RoutineCreateInput, RoutineUpdateInput } from './routines';
import { setProviderSecret, clearProviderSecret } from './secrets';
import { RoomManager, Room } from './rooms';

let mainWindow: BrowserWindow | null = null;
let agentBus: AgentBus;
let routineManager: RoutineManager;
let roomManager: RoomManager;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  agentBus = new AgentBus({
    providers: [
      new MockEchoProvider(),
      new MockIntelligentProvider(),
      new MiniMaxProvider(),
      new ZaiProvider(),
      new CodingPlanProvider(),
      new AnthropicProvider(),
    ],
    defaultProviderId: 'mock-intelligent',
  });

  agentBus.registerAgent({
    id: '1',
    name: 'Assistant',
    providerId: 'mock-intelligent',
    avatar: '🤖',
    status: 'active',
    unread: 0,
  });

  agentBus.registerAgent({
    id: '2',
    name: 'Researcher',
    providerId: 'mock-echo',
    avatar: '📚',
    status: 'idle',
    unread: 2,
  });

  agentBus.registerAgent({
    id: '3',
    name: 'Coder',
    providerId: 'mock-intelligent',
    avatar: '💻',
    status: 'active',
    unread: 0,
  });

  routineManager = new RoutineManager(async (routine: Routine) => {
    const defaultProviderId = agentBus.getDefaultProviderId();
    const agents = agentBus.getAllAgents();
    let targetAgentId = agents.find((a) => a.providerId === defaultProviderId)?.id || agents[0]?.id;
    if (!targetAgentId) {
      console.error('No agent available for routine execution');
      return;
    }
    try {
      await agentBus.sendMessage(routine.prompt, targetAgentId, { routine: true });
      console.log(`Routine fired: ${routine.name}`);
    } catch (err) {
      console.error(`Failed to execute routine ${routine.name}:`, err);
    }
  });
  routineManager.startScheduler();

  roomManager = new RoomManager();
  
  const existingRooms = roomManager.listRooms();
  if (existingRooms.length === 0) {
    roomManager.createRoom('Team Chat', ['1', '2', '3']);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (routineManager) {
    routineManager.stopScheduler();
  }
});

ipcMain.handle('send-message', async (event, agentId: string, message: string) => {
  const primary = await agentBus.sendMessageWithWake(
    message,
    agentId,
    undefined,
    (wakeResponse) => {
      event.sender.send('wake-response', {
        id: wakeResponse.id,
        content: wakeResponse.content,
        role: wakeResponse.role,
        timestamp: wakeResponse.timestamp,
        agentId: wakeResponse.agentId,
        agentName: wakeResponse.agentName,
        agentAvatar: wakeResponse.agentAvatar,
        targetAgentId: agentId,
      });
    }
  );

  return {
    id: primary.id,
    content: primary.content,
    role: primary.role,
    timestamp: primary.timestamp,
    agentId: primary.agentId,
    agentName: primary.agentName,
    agentAvatar: primary.agentAvatar,
  };
});

ipcMain.handle('get-channels', async () => {
  return [
    { id: '1', name: 'General', icon: '💬' },
    { id: '2', name: 'Development', icon: '🔧' },
    { id: '3', name: 'Research', icon: '🔬' },
  ];
});

ipcMain.handle('get-agents', async () => {
  const agents = agentBus.getAllAgents();
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    avatar: agent.avatar,
    providerId: agent.providerId,
    unread: agent.unread || 0,
  }));
});

ipcMain.handle('list-providers', async () => {
  return await agentBus.getAllProviders();
});

ipcMain.handle('set-default-provider', async (_event, providerId: string) => {
  agentBus.setDefaultProvider(providerId);
  return { success: true };
});

ipcMain.handle('get-default-provider', async () => {
  return agentBus.getDefaultProviderId();
});

ipcMain.handle('update-agent-provider', async (_event, agentId: string, providerId: string) => {
  agentBus.updateAgentProvider(agentId, providerId);
  return { success: true };
});

ipcMain.handle('list-routines', async () => {
  return routineManager.listRoutines();
});

ipcMain.handle('create-routine', async (_event, input: RoutineCreateInput) => {
  return routineManager.createRoutine(input);
});

ipcMain.handle('update-routine', async (_event, id: string, input: RoutineUpdateInput) => {
  return routineManager.updateRoutine(id, input);
});

ipcMain.handle('set-routine-enabled', async (_event, id: string, enabled: boolean) => {
  return routineManager.setRoutineEnabled(id, enabled);
});

ipcMain.handle('delete-routine', async (_event, id: string) => {
  return routineManager.deleteRoutine(id);
});

ipcMain.handle('set-provider-secret', async (_event, providerId: string, secretName: string, value: string) => {
  try {
    if (!providerId || typeof providerId !== 'string') {
      return { ok: false, error: 'Invalid providerId' };
    }
    if (!secretName || typeof secretName !== 'string') {
      return { ok: false, error: 'Invalid secretName' };
    }
    if (!value || typeof value !== 'string') {
      return { ok: false, error: 'Invalid value' };
    }

    setProviderSecret(providerId, secretName, value);
    
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('clear-provider-secret', async (_event, providerId: string, secretName: string) => {
  try {
    if (!providerId || typeof providerId !== 'string') {
      return { ok: false, error: 'Invalid providerId' };
    }
    if (!secretName || typeof secretName !== 'string') {
      return { ok: false, error: 'Invalid secretName' };
    }

    const cleared = clearProviderSecret(providerId, secretName);
    
    return { ok: true, cleared };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('list-rooms', async () => {
  return roomManager.listRooms();
});

ipcMain.handle('create-room', async (_event, name: string, memberAgentIds: string[]) => {
  return roomManager.createRoom(name, memberAgentIds);
});

ipcMain.handle('get-room', async (_event, roomId: string) => {
  return roomManager.getRoom(roomId);
});

ipcMain.handle('update-room', async (_event, roomId: string, updates: Partial<Omit<Room, 'id'>>) => {
  return roomManager.updateRoom(roomId, updates);
});

ipcMain.handle('delete-room', async (_event, roomId: string) => {
  return roomManager.deleteRoom(roomId);
});

ipcMain.handle('get-room-messages', async (_event, roomId: string) => {
  return roomManager.getRoomMessages(roomId);
});

ipcMain.handle('send-room-message', async (event, roomId: string, content: string, senderId?: string) => {
  const room = roomManager.getRoom(roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }

  const userMessage = {
    id: `${Date.now()}-user`,
    roomId,
    content,
    role: 'user' as const,
    timestamp: Date.now(),
  };
  
  roomManager.addRoomMessage(userMessage);

  const mentionedAgentIds = extractRoomMentions(content, room.memberAgentIds);
  
  if (mentionedAgentIds.length === 0) {
    if (senderId) {
      if (!room.memberAgentIds.includes(senderId)) {
        throw new Error(`Agent ${senderId} is not a member of room ${roomId}`);
      }
      
      const agent = agentBus.getAgent(senderId);
      if (agent) {
        agentBus.sendMessage(content, senderId, { room: roomId })
          .then((response) => {
            const assistantMessage = {
              id: response.id,
              roomId,
              content: response.content,
              role: 'assistant' as const,
              timestamp: response.timestamp,
              agentId: senderId,
              agentName: agent.name,
              agentAvatar: agent.avatar,
            };
            roomManager.addRoomMessage(assistantMessage);
            event.sender.send('room-fan-in-response', assistantMessage);
          })
          .catch((err) => {
            console.error(`Failed to send message from agent ${senderId}:`, err);
          });
      }
    }
    return userMessage;
  }

  mentionedAgentIds.forEach((agentId) => {
    const agent = agentBus.getAgent(agentId);
    if (!agent) {
      console.error(`Agent not found: ${agentId}`);
      return;
    }

    agentBus.sendMessage(content, agentId, { room: roomId })
      .then((response) => {
        const assistantMessage = {
          id: response.id,
          roomId,
          content: response.content,
          role: 'assistant' as const,
          timestamp: response.timestamp,
          agentId,
          agentName: agent.name,
          agentAvatar: agent.avatar,
        };
        
        roomManager.addRoomMessage(assistantMessage);
        roomManager.incrementUnread(roomId);
        
        event.sender.send('room-fan-in-response', assistantMessage);
      })
      .catch((err) => {
        console.error(`Failed to wake agent ${agentId} in room ${roomId}:`, err);
      });
  });
  
  return userMessage;
});

ipcMain.handle('clear-room-unread', async (_event, roomId: string) => {
  roomManager.clearUnread(roomId);
  return { success: true };
});

function extractRoomMentions(message: string, memberAgentIds: string[]): string[] {
  const mentionPattern = /@(\w+)/g;
  const matches = Array.from(message.matchAll(mentionPattern));
  const mentionedNames = matches.map((m) => m[1].toLowerCase());

  const agentIds: string[] = [];
  for (const agentId of memberAgentIds) {
    const agent = agentBus.getAgent(agentId);
    if (agent && mentionedNames.includes(agent.name.toLowerCase())) {
      agentIds.push(agentId);
    }
  }
  return agentIds;
}
