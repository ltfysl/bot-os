// #59 commit 1 (Remy soft 1): after wake-timeout a DM wake must not stream any more chunks, done:true included.
// Drives the real `send-message-stream` IPC handler in dist/main/main.js with electron stubbed. Run after `npm run build`.
const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'botos-59-'));
const handlers = {};
const timeline = [];
let ready;
const electronStub = {
  app: { whenReady: () => new Promise((r) => { ready = r; }), on: () => {}, getPath: () => userData, quit: () => {} },
  BrowserWindow: class {
    constructor() { this.webContents = { send: (ch, p) => timeline.push({ t: Date.now(), ch, p }), on: () => {}, openDevTools: () => {} }; }
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
  P.prototype.sendMessageStream = async (msg, _ctx, onChunk) => {
    // Woken agent is slow: 8 chunks, 1 s apart, so it runs past the 5 s wake budget.
    const slow = msg.startsWith('Wake request');
    const parts = slow ? Array.from({ length: 8 }, (_, i) => `slow${i} `) : ['ok '];
    for (const p of parts) { await wait(slow ? 1000 : 5); onChunk(p, false); }
    onChunk('', true);
    return parts.join('');
  };
}
require('../../dist/main/main.js');

(async () => {
  ready();
  await wait(300);
  const sink = [];
  const ev = { sender: { send: (ch, p) => timeline.push({ t: Date.now(), ch, p }) && sink.push(p) } };
  await handlers['send-message-stream'](ev, '1', 'hi @Coder');
  await wait(10000);
  const timeoutAt = timeline.find((e) => e.ch === 'wake-timeout');
  const wakeChunks = timeline.filter((e) => e.ch === 'wake-stream-chunk');
  const after = timeoutAt ? wakeChunks.filter((e) => e.t >= timeoutAt.t) : [];
  const out = {
    wakeTimeoutEmitted: !!timeoutAt,
    timeoutMs: timeoutAt?.p?.timeoutMs,
    wakeChunksBeforeTimeout: wakeChunks.length - after.length,
    wakeChunksAfterTimeout: after.length,
    doneAfterTimeout: after.some((e) => e.p.done),
    channels: [...new Set(timeline.map((e) => e.ch))],
  };
  out.pass = out.wakeTimeoutEmitted && out.wakeChunksAfterTimeout === 0;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
})();
