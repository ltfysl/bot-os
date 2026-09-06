import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { AgentBus } from './agent-bus';
import { MockEchoProvider, MockIntelligentProvider } from './providers/mock-providers';

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
    providers: [new MockEchoProvider(), new MockIntelligentProvider()],
    defaultProviderId: 'mock-intelligent',
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

ipcMain.handle('send-message', async (_event, message: string) => {
  const response = await agentBus.sendMessage(message);
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
  return [
    { id: '1', name: 'Assistant', status: 'active', avatar: '🤖', unread: 0 },
    { id: '2', name: 'Researcher', status: 'idle', avatar: '📚', unread: 2 },
    { id: '3', name: 'Coder', status: 'active', avatar: '💻', unread: 0 },
  ];
});
