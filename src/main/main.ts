import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { AgentBus } from './agent-bus';
import { MockEchoProvider, MockIntelligentProvider } from './providers/mock-providers';
import { MiniMaxProvider } from './providers/minimax-provider';
import { ZaiProvider } from './providers/zai-provider';
import { CodingPlanProvider } from './providers/coding-plan-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { RoutineManager, Routine, RoutineCreateInput, RoutineUpdateInput } from './routines';
import { setProviderSecret, clearProviderSecret, loadPersistedSecrets } from './secrets';
import { RoomManager, Room } from './rooms';
import { DmManager } from './dms';

let mainWindow: BrowserWindow | null = null;
let agentBus: AgentBus;
let routineManager: RoutineManager;
let roomManager: RoomManager;
let dmManager: DmManager;

declare global {
  // eslint-disable-next-line no-var
  var roomManager: RoomManager | undefined;
}

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

app.whenReady().then(async () => {
  await loadPersistedSecrets();

  agentBus = new AgentBus({
    providers: [
      new MockEchoProvider(),
      new MockIntelligentProvider(),
      new MiniMaxProvider(),
      new ZaiProvider(),
      new CodingPlanProvider(),
      new AnthropicProvider(),
      new OpenAIProvider(),
      new GeminiProvider(),
    ],
    defaultProviderId: 'mock-intelligent',
    maxConcurrentWakes: 10,
    wakeQueueLimit: 50,
    onWakeEvent: (event) => {
      if (!mainWindow) return;
      
      if ('success' in event) {
        mainWindow.webContents.send('wake-completion', {
          roomId: event.roomId,
          initiatorAgentId: event.initiatorAgentId,
          targetAgentId: event.targetAgentId,
          success: event.success,
          reason: event.reason,
          errorMessage: event.errorMessage,
          timestamp: event.timestamp,
          orderIndex: event.orderIndex,
        });
      } else if ('reason' in event && event.reason === 'timeout') {
        mainWindow.webContents.send('wake-timeout', {
          roomId: event.roomId,
          dmId: event.dmId,
          initiatorAgentId: event.initiatorAgentId,
          targetAgentId: event.targetAgentId,
          timeoutMs: 5000,
          timestamp: event.timestamp,
        });
      } else if ('denialReason' in event) {
        mainWindow.webContents.send('wake-membership-denied', {
          roomId: event.roomId,
          initiatorAgentId: event.initiatorAgentId,
          targetAgentId: event.targetAgentId,
          denialReason: event.denialReason,
          timestamp: event.timestamp,
        });
      } else if ('reason' in event) {
        mainWindow.webContents.send('wake-failure', {
          roomId: event.roomId,
          dmId: event.dmId,
          initiatorAgentId: event.initiatorAgentId,
          targetAgentId: event.targetAgentId,
          reason: event.reason,
          errorMessage: event.errorMessage,
          timestamp: event.timestamp,
        });
      }
    },
  });

  agentBus.registerAgent({
    id: '1',
    name: 'Assistant',
    providerId: 'mock-intelligent',
    avatar: 'AS',
    status: 'active',
    unread: 0,
  });

  agentBus.registerAgent({
    id: '2',
    name: 'Researcher',
    providerId: 'mock-echo',
    avatar: 'RE',
    status: 'idle',
    unread: 2,
  });

  agentBus.registerAgent({
    id: '3',
    name: 'Coder',
    providerId: 'mock-intelligent',
    avatar: 'CO',
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
  global.roomManager = roomManager;
  
  const existingRooms = roomManager.listRooms();
  if (existingRooms.length === 0) {
    roomManager.createRoom('Team Chat', ['1', '2', '3']);
  }

  dmManager = new DmManager();

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

const widgetTriggers = {
  'single-select': {
    keywords: ['pick one', 'choose one', 'single option'],
    generator: () => ({
      id: `widget-${Date.now()}`,
      type: 'single-select' as const,
      title: 'Choose your preferred option',
      options: [
        { id: 'opt1', label: 'Option A' },
        { id: 'opt2', label: 'Option B' },
        { id: 'opt3', label: 'Option C' },
      ],
    }),
  },
  'multi-select': {
    keywords: ['select multiple', 'pick several', 'choose multiple'],
    generator: () => ({
      id: `widget-${Date.now()}`,
      type: 'multi-select' as const,
      title: 'Select all that apply',
      options: [
        { id: 'feature1', label: 'Add authentication' },
        { id: 'feature2', label: 'Improve UI design' },
        { id: 'feature3', label: 'Add tests' },
        { id: 'feature4', label: 'Update documentation' },
      ],
    }),
  },
  'danger': {
    keywords: ['delete', 'remove', 'dangerous action'],
    generator: () => ({
      id: `widget-${Date.now()}`,
      type: 'danger' as const,
      title: 'This action is destructive',
      options: [
        { id: 'proceed', label: 'Proceed anyway' },
        { id: 'cancel', label: 'Cancel safely' },
      ],
    }),
  },
  'allow-custom': {
    keywords: ['custom input', 'enter value', 'allow custom'],
    generator: () => ({
      id: `widget-${Date.now()}`,
      type: 'allow-custom' as const,
      title: 'Choose or enter custom value',
      options: [
        { id: 'preset1', label: 'Use default configuration' },
        { id: 'preset2', label: 'Use advanced settings' },
        { id: 'preset3', label: 'Skip this step' },
      ],
    }),
  },
};

ipcMain.handle('send-message', async (event, agentId: string, message: string) => {
  const messageLower = message.toLowerCase();
  
  for (const [_type, trigger] of Object.entries(widgetTriggers)) {
    if (trigger.keywords.some(keyword => messageLower.includes(keyword))) {
      const widgetRequest = trigger.generator();
      setTimeout(() => {
        event.sender.send('widget-request', widgetRequest);
      }, 800);
      break;
    }
  }

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

ipcMain.handle('send-message-stream', async (event, agentId: string, message: string) => {
  const messageId = `${Date.now()}-${agentId}`;
  const primaryAgent = agentBus.getAgent(agentId);

  if (!primaryAgent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  agentBus.sendMessageWithWakeStream(
    message,
    agentId,
    undefined,
    (streamAgentId, chunk, done) => {
      event.sender.send('message-stream-chunk', {
        id: messageId,
        agentId: streamAgentId,
        agentName: primaryAgent.name,
        agentAvatar: primaryAgent.avatar,
        chunk,
        done,
        targetAgentId: agentId,
      });
    },
    (wokeAgentId, chunk, done) => {
      const wokeAgent = agentBus.getAgent(wokeAgentId);
      if (wokeAgent) {
        const wakeMessageId = `${Date.now()}-${wokeAgentId}`;
        event.sender.send('wake-stream-chunk', {
          id: wakeMessageId,
          agentId: wokeAgentId,
          agentName: wokeAgent.name,
          agentAvatar: wokeAgent.avatar,
          chunk,
          done,
          targetAgentId: agentId,
        });
      }
    }
  ).catch((err) => {
    console.error('Stream error:', err);
    event.sender.send('message-stream-error', {
      id: messageId,
      agentId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  });

  return { id: messageId, agentId, streaming: true };
});

ipcMain.handle('get-channels', async () => {
  return [
    { id: '1', name: 'General', icon: '' },
    { id: '2', name: 'Development', icon: '' },
    { id: '3', name: 'Research', icon: '' },
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

    await setProviderSecret(providerId, secretName, value);
    
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

    const cleared = await clearProviderSecret(providerId, secretName);
    
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

ipcMain.handle('send-room-message-stream', async (event, roomId: string, content: string, senderId?: string) => {
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
        const messageId = `${Date.now()}-${senderId}`;
        agentBus.sendMessageWithWakeStream(
          content,
          senderId,
          { room: roomId },
          (streamAgentId, chunk, done) => {
            event.sender.send('room-stream-chunk', {
              id: messageId,
              roomId,
              agentId: streamAgentId,
              agentName: agent.name,
              agentAvatar: agent.avatar,
              chunk,
              done,
            });

            if (done) {
              const fullContent = chunk;
              const assistantMessage = {
                id: messageId,
                roomId,
                content: fullContent,
                role: 'assistant' as const,
                timestamp: Date.now(),
                agentId: senderId,
                agentName: agent.name,
                agentAvatar: agent.avatar,
              };
              roomManager.addRoomMessage(assistantMessage);
            }
          }
        ).catch((err) => {
          console.error(`Failed to send stream message from agent ${senderId}:`, err);
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

    const messageId = `${Date.now()}-${agentId}`;
    let accumulatedContent = '';

    agentBus.sendMessageWithWakeStream(
      content,
      agentId,
      { room: roomId },
      (streamAgentId, chunk, done) => {
        if (!done) {
          accumulatedContent += chunk;
        } else {
          accumulatedContent = chunk;
        }

        event.sender.send('room-stream-chunk', {
          id: messageId,
          roomId,
          agentId: streamAgentId,
          agentName: agent.name,
          agentAvatar: agent.avatar,
          chunk,
          done,
        });

        if (done) {
          const assistantMessage = {
            id: messageId,
            roomId,
            content: accumulatedContent,
            role: 'assistant' as const,
            timestamp: Date.now(),
            agentId,
            agentName: agent.name,
            agentAvatar: agent.avatar,
          };
          
          roomManager.addRoomMessage(assistantMessage);
          roomManager.incrementUnread(roomId);
        }
      }
    ).catch((err) => {
      console.error(`Failed to wake agent ${agentId} in room ${roomId}:`, err);
    });
  });
  
  return userMessage;
});

ipcMain.handle('clear-room-unread', async (_event, roomId: string) => {
  roomManager.clearUnread(roomId);
  return { success: true };
});

ipcMain.handle('request-agent-wake', async (_event, initiatorAgentId: string, targetAgentId: string, message: string, roomId?: string, dmId?: string) => {
  try {
    await agentBus.requestAgentWake(initiatorAgentId, targetAgentId, message, roomId, dmId);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

ipcMain.handle('request-targeted-room-wake', async (_event, request: import('./agent-bus').TargetedWakeRequest) => {
  try {
    await agentBus.requestTargetedRoomWake(request);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
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

ipcMain.handle('respond-to-widget', async (_event, response) => {
  console.log('Widget response received:', response);
  return;
});

ipcMain.handle('get-or-create-dm', async (_event, agentId1: string, agentId2: string) => {
  return dmManager.getOrCreateDm(agentId1, agentId2);
});

ipcMain.handle('get-dm', async (_event, agentId1: string, agentId2: string) => {
  return dmManager.getDm(agentId1, agentId2);
});

ipcMain.handle('list-dms-for-agent', async (_event, agentId: string) => {
  return dmManager.listDmsForAgent(agentId);
});

ipcMain.handle('get-dm-messages', async (_event, dmId: string) => {
  return dmManager.getDmMessages(dmId);
});

ipcMain.handle('send-dm-message', async (event, dmId: string, content: string, senderId: string, shouldWake?: boolean) => {
  const dm = dmManager.getDm(senderId, dmManager.getOtherParticipant(dmId, senderId) || '');
  if (!dm) {
    throw new Error(`DM not found: ${dmId}`);
  }

  if (!dm.participants.includes(senderId)) {
    throw new Error(`Agent ${senderId} is not a participant in DM ${dmId}`);
  }

  const sender = agentBus.getAgent(senderId);
  if (!sender) {
    throw new Error(`Sender agent not found: ${senderId}`);
  }

  const userMessage = {
    id: `${Date.now()}-user`,
    dmId,
    content,
    role: 'user' as const,
    timestamp: Date.now(),
    senderId,
    senderName: sender.name,
    senderAvatar: sender.avatar,
  };

  dmManager.addDmMessage(userMessage);

  if (shouldWake) {
    const targetAgentId = dmManager.getOtherParticipant(dmId, senderId);
    if (targetAgentId) {
      const target = agentBus.getAgent(targetAgentId);
      if (target) {
        agentBus.requestAgentWake(senderId, targetAgentId, content, undefined, dmId)
          .then(async () => {
            const response = await agentBus.sendMessage(content, targetAgentId, { dm: dmId });
            const assistantMessage = {
              id: response.id,
              dmId,
              content: response.content,
              role: 'assistant' as const,
              timestamp: response.timestamp,
              senderId: targetAgentId,
              senderName: target.name,
              senderAvatar: target.avatar,
            };
            dmManager.addDmMessage(assistantMessage);
            event.sender.send('dm-wake-response', assistantMessage);
          })
          .catch((err) => {
            console.error(`Failed to wake agent ${targetAgentId} in DM ${dmId}:`, err);
          });
      }
    }
  }

  return userMessage;
});

ipcMain.handle('send-dm-message-stream', async (event, dmId: string, content: string, senderId: string, shouldWake?: boolean) => {
  const dm = dmManager.getDm(senderId, dmManager.getOtherParticipant(dmId, senderId) || '');
  if (!dm) {
    throw new Error(`DM not found: ${dmId}`);
  }

  if (!dm.participants.includes(senderId)) {
    throw new Error(`Agent ${senderId} is not a participant in DM ${dmId}`);
  }

  const sender = agentBus.getAgent(senderId);
  if (!sender) {
    throw new Error(`Sender agent not found: ${senderId}`);
  }

  const userMessage = {
    id: `${Date.now()}-user`,
    dmId,
    content,
    role: 'user' as const,
    timestamp: Date.now(),
    senderId,
    senderName: sender.name,
    senderAvatar: sender.avatar,
  };

  dmManager.addDmMessage(userMessage);

  if (shouldWake) {
    const targetAgentId = dmManager.getOtherParticipant(dmId, senderId);
    if (targetAgentId) {
      const target = agentBus.getAgent(targetAgentId);
      if (target) {
        const messageId = `${Date.now()}-${targetAgentId}`;
        let accumulatedContent = '';

        agentBus.requestAgentWake(senderId, targetAgentId, content, undefined, dmId)
          .then(async () => {
            const provider = agentBus.getProvider(target.providerId);
            if (!provider) {
              throw new Error(`Provider not found for agent: ${target.providerId}`);
            }

            const isAvailable = await provider.isAvailable();
            if (!isAvailable) {
              throw new Error(`Provider not available: ${target.providerId}`);
            }

            if (provider.sendMessageStream) {
              await provider.sendMessageStream(content, { dm: dmId }, (chunk, done) => {
                if (!done) {
                  accumulatedContent += chunk;
                } else {
                  accumulatedContent = chunk;
                }

                event.sender.send('dm-stream-chunk', {
                  id: messageId,
                  dmId,
                  senderId: targetAgentId,
                  senderName: target.name,
                  senderAvatar: target.avatar,
                  chunk,
                  done,
                });

                if (done) {
                  const assistantMessage = {
                    id: messageId,
                    dmId,
                    content: accumulatedContent,
                    role: 'assistant' as const,
                    timestamp: Date.now(),
                    senderId: targetAgentId,
                    senderName: target.name,
                    senderAvatar: target.avatar,
                  };
                  dmManager.addDmMessage(assistantMessage);
                }
              });
            } else {
              const response = await provider.sendMessage(content, { dm: dmId });
              event.sender.send('dm-stream-chunk', {
                id: messageId,
                dmId,
                senderId: targetAgentId,
                senderName: target.name,
                senderAvatar: target.avatar,
                chunk: response,
                done: true,
              });

              const assistantMessage = {
                id: messageId,
                dmId,
                content: response,
                role: 'assistant' as const,
                timestamp: Date.now(),
                senderId: targetAgentId,
                senderName: target.name,
                senderAvatar: target.avatar,
              };
              dmManager.addDmMessage(assistantMessage);
            }
          })
          .catch((err) => {
            console.error(`Failed to wake agent ${targetAgentId} in DM ${dmId}:`, err);
          });
      }
    }
  }

  return userMessage;
});
