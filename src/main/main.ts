import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { AgentBus } from './agent-bus';
import { MockEchoProvider, MockIntelligentProvider } from './providers/mock-providers';
import { MiniMaxProvider } from './providers/minimax-provider';

let mainWindow: BrowserWindow | null = null;
let agentBus: AgentBus;

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

ipcMain.handle('send-message', async (_event, agentId: string, message: string) => {
  const response = await agentBus.sendMessage(message, agentId);
  return {
    id: response.id,
    content: response.content,
    role: response.role,
    timestamp: response.timestamp,
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
