// #59 (Remy soft on #58): a room-primary provider that fails before its first chunk must
// send room-stream-error with the wakeId as id. Drives the real IPC handler; run after `npm run build`.
const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'botos-59b-'));
const handlers = {};
const timeline = [];
let ready;
const electronStub = {
  app: { whenReady: () => new Promise((r) => { ready = r; }), on: () => {}, getPath: () => userData, quit: () => {} },
  BrowserWindow: class {
    constructor() { this.webContents = { send: (ch, p) => timeline.push({ ch, p }), on: () => {}, openDevTools: () => {} }; }
    loadURL() { return Promise.resolve(); } loadFile() { return Promise.resolve(); } on() {}
    static getAllWindows() { return []; }
  },
  ipcMain: { handle: (n, fn) => { handlers[n] = fn; }, on: () => {} },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
};
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? electronStub : origLoad.call(this, req, ...rest); };
const mocks = require('../../dist/main/providers/mock-providers.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const P of [mocks.MockEchoProvider, mocks.MockIntelligentProvider]) {
  P.prototype.isAvailable = async () => true;
  P.prototype.sendMessage = async () => 'ok';
  P.prototype.sendMessageStream = async () => { await wait(20); throw new Error('provider exploded before first chunk'); };
}
require('../../dist/main/main.js');
(async () => {
  ready();
  await wait(300);
  const room = (await handlers['list-rooms']())[0];
  const ev = { sender: { send: (ch, p) => timeline.push({ ch, p }) } };
  await handlers['send-room-message-stream'](ev, room.id, 'hello room', '1');
  await wait(500);
  const started = timeline.find((e) => e.ch === 'wake-started')?.p;
  const err = timeline.find((e) => e.ch === 'room-stream-error')?.p;
  const out = {
    startedWakeId: started?.wakeId,
    errorId: err?.id,
    errorWakeId: err?.wakeId,
    chunksBeforeError: timeline.filter((e) => e.ch === 'room-stream-chunk').length,
  };
  out.pass = !!err && !!started && err.id === started.wakeId && err.wakeId === started.wakeId;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
})();
