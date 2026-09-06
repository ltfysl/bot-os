import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { AgentBus } from './agent-bus';
import { MockEchoProvider, MockIntelligentProvider } from './providers/mock-providers';
import { MiniMaxProvider } from './providers/minimax-provider';
import { ZaiProvider } from './providers/zai-provider';
import { RoutineManager, Routine, RoutineCreateInput, RoutineUpdateInput } from './routines';
import { setProviderSecret, clearProviderSecret } from './secrets';

let mainWindow: BrowserWindow | null = null;
let agentBus: AgentBus;
let routineManager: RoutineManager;

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
