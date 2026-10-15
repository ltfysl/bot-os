// Harness for #58 that drives the real IPC handlers in dist/main/main.js. Run after `npm run build`.
// Electron is stubbed; providers are the app's own mocks with a scripted stream added.
const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'botos-58-'));
const handlers = {};
const windowSends = [];
let ready;
const electronStub = {
  app: {
    whenReady: () => new Promise((r) => { ready = r; }),
    on: () => {},
    getPath: () => userData,
    quit: () => {},
  },
  BrowserWindow: class {
    constructor() { this.webContents = { send: (ch, p) => windowSends.push({ ch, p }), on: () => {}, openDevTools: () => {} }; }
    loadURL() { return Promise.resolve(); }
    loadFile() { return Promise.resolve(); }
    on() {}
    static getAllWindows() { return []; }
  },
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; }, on: () => {} },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronStub;
  return origLoad.call(this, request, ...rest);
};

// Scripted streaming for the app's mock providers.
const mocks = require('../../dist/main/providers/mock-providers.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const replyFor = (msg) => (msg.includes('ask-coder') ? 'sure @Coder go' : 'ok done here');
for (const P of [mocks.MockEchoProvider, mocks.MockIntelligentProvider]) {
  P.prototype.isAvailable = async () => true;
  P.prototype.sendMessage = async (msg) => replyFor(msg);
  P.prototype.sendMessageStream = async (msg, _ctx, onChunk) => {
    const text = replyFor(msg);
    for (const t of text.split(' ')) { await wait(5); onChunk(t + ' ', false); }
    onChunk('', true);
    return text;
  };
}

require('../../dist/main/main.js');

function fakeEvent(sink) {
  return { sender: { send: (ch, p) => sink.push({ ch, p }) } };
}
const summarize = (sends, ch) => {
  const c = sends.filter((s) => s.ch === ch).map((s) => s.p);
  return {
    chunks: c.length,
    withSender: c.filter((p) => p.senderAgentId).length,
    senders: [...new Set(c.map((p) => p.senderAgentId))],
    idsEqualWakeId: c.every((p) => p.wakeId && p.id === p.wakeId),
    distinctIds: new Set(c.map((p) => p.id)).size,
  };
};

(async () => {
  ready();
  await wait(300);
  const room = (await handlers['list-rooms']())[0];
  const out = {};

  // DM: Assistant (1) is asked and wakes @Coder (3).
  { const s = []; await handlers['send-message-stream'](fakeEvent(s), '1', 'hi @Coder'); await wait(600);
    out.dmPrimary = summarize(s, 'message-stream-chunk'); out.dmWoken = summarize(s, 'wake-stream-chunk'); }
  // Room primary: no mention, sender Assistant streams.
  { const s = []; await handlers['send-room-message-stream'](fakeEvent(s), room.id, 'hello room', '1'); await wait(600);
    out.roomPrimary = summarize(s, 'room-stream-chunk'); }
  // Room multi-mention: @Assistant and @Coder.
  { const s = []; await handlers['send-room-message-stream'](fakeEvent(s), room.id, 'hi @Assistant @Coder', undefined); await wait(800);
    out.roomMultiMention = summarize(s, 'room-stream-chunk'); }
  // Room bot-to-bot: Assistant's reply mentions @Coder.
  { const s = []; await handlers['send-room-message-stream'](fakeEvent(s), room.id, '@Assistant ask-coder', undefined); await wait(800);
    out.roomBotToBot = summarize(s, 'room-stream-chunk'); }
  // Persisted room messages use the wakeId as id.
  const msgs = await handlers['get-room-messages'](null, room.id);
  out.persistedAssistantIdsAreWakeIds = msgs.filter((m) => m.role === 'assistant').every((m) => String(m.id).startsWith('wake-'));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})();
