// #59: a user message is never dropped as already-in-flight. It queues behind the agent's current
// wake on its own chain (own budget), survives cancel of the bot chain, and Remy's case:
// requestAgentWake on an agent that only waits for a user message is neither skipped nor charged
// to the user chain. Drives the real IPC handlers in dist/main/main.js. Run after `npm run build`.
const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'botos-59-queue-'));
const handlers = {};
const windowSends = [];
let ready;
const electronStub = {
  app: { whenReady: () => new Promise((r) => { ready = r; }), on: () => {}, getPath: () => userData, quit: () => {} },
  BrowserWindow: class {
    constructor() { this.webContents = { send: (ch, p) => windowSends.push({ ch, p, t: Date.now() }), on: () => {}, openDevTools: () => {} }; }
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Scripted mocks: Assistant's reply to "ask-coder" mentions @Coder (bot chain). Coder's answer to
// a bot mention is slow (≈600 ms) so user messages arrive while it is in flight.
const mocks = require('../../dist/main/providers/mock-providers.js');
const replyFor = (msg) => (msg.includes('ask-coder') ? 'sure @Coder go' : msg.includes('sure @Coder') ? 'bot answer from coder now' : 'user answer');
const delayFor = (msg) => (msg.includes('sure @Coder') ? 120 : 5);
for (const P of [mocks.MockEchoProvider, mocks.MockIntelligentProvider]) {
  P.prototype.isAvailable = async () => true;
  P.prototype.sendMessage = async (msg) => { await wait(delayFor(msg) * 3); return replyFor(msg); };
  P.prototype.sendMessageStream = async (msg, _ctx, onChunk) => {
    const text = replyFor(msg);
    for (const t of text.split(' ')) { await wait(delayFor(msg)); onChunk(t + ' ', false); }
    onChunk('', true);
    return text;
  };
}
// Read-only handle on the app's bus for budget snapshots (no behaviour change).
const busMod = require('../../dist/main/agent-bus.js');
let bus;
const origReg = busMod.AgentBus.prototype.registerAgent;
busMod.AgentBus.prototype.registerAgent = function (...a) { bus = this; return origReg.apply(this, a); };

require('../../dist/main/main.js');

const fakeEvent = (sink) => ({ sender: { send: (ch, p) => sink.push({ ch, p, t: Date.now() }) } });
const win = (ch) => windowSends.filter((s) => s.ch === ch).map((s) => s.p);
const since = (n) => windowSends.slice(n);
const CODER = '3';
const ASSISTANT = '1';

// Start a bot chain where Coder is in flight (depth 2, woken by Assistant's reply).
async function startBotChain(roomId, sink) {
  const r = await handlers['send-room-message-stream'](fakeEvent(sink), roomId, '@Assistant ask-coder', undefined);
  for (let i = 0; i < 100; i++) {
    const s = win('wake-started').find((e) => e.targetAgentId === CODER && e.chainId === r.chainId);
    if (s) return { botChainId: r.chainId, botWakeId: s.wakeId };
    await wait(10);
  }
  throw new Error('bot wake for Coder never started');
}
const doneAt = (sink, wakeId) => sink.find((s) => s.ch === 'room-stream-chunk' && s.p.wakeId === wakeId && s.p.done)?.t;

(async () => {
  ready();
  await wait(300);
  const room = await handlers['create-room'](null, 'queue-59', [ASSISTANT, '2', CODER]);
  const out = {};

  // (a)+(b) user message to Coder while its bot wake is in flight.
  {
    const mark = windowSends.length;
    const sink = [];
    const { botChainId, botWakeId } = await startBotChain(room.id, sink);
    const user = await handlers['send-room-message-stream'](fakeEvent(sink), room.id, 'hi @Coder', undefined);
    await wait(30);
    const queued = since(mark).filter((s) => s.ch === 'wake-user-queued').map((s) => s.p);
    const q = queued[0];
    const queuedBudgetWhileWaiting = q ? bus.getChainWakeCount(q.chainId) : -1;
    const botBudgetWhileWaiting = bus.getChainWakeCount(botChainId);
    await wait(1500);
    const ev = since(mark);
    const userStarted = ev.find((s) => s.ch === 'wake-started' && q && s.p.wakeId === q.wakeId);
    out.a_queueAfterInFlight = {
      queuedEvents: queued.length,
      waitingForBotWake: !!q && q.waitingForWakeIds.includes(botWakeId),
      alreadyInFlightSkips: ev.filter((s) => s.ch === 'wake-order-skip' && s.p.reason === 'already-in-flight').length,
      userWakeRan: !!(q && doneAt(sink, q.wakeId)),
      startedAfterBotDone: !!(userStarted && doneAt(sink, botWakeId) && userStarted.t >= doneAt(sink, botWakeId)),
    };
    out.b_ownChainAndBudget = {
      queuedChainId: q?.chainId,
      botChainId,
      fromChainId: q?.fromChainId,
      distinctFromBotChain: !!q && q.chainId !== botChainId,
      distinctFromIncomingChain: !!q && q.chainId !== user.chainId && q.fromChainId === user.chainId,
      startedCarriesQueuedChain: userStarted?.p.chainId === q?.chainId,
      queuedChainBudgetWhileWaiting: queuedBudgetWhileWaiting,
      botChainBudgetWhileWaiting: botBudgetWhileWaiting,
      budgetFreedAfterEnd: q ? bus.getChainWakeCount(q.chainId) === 0 : false,
    };
  }

  // (a2) DM: user message to Coder while Coder is busy in the room bot chain → queued, not dropped.
  {
    const mark = windowSends.length;
    const sink = [];
    const { botWakeId } = await startBotChain(room.id, []);
    await handlers['send-message-stream'](fakeEvent(sink), CODER, 'hello coder');
    await wait(30);
    const q = since(mark).find((s) => s.ch === 'wake-user-queued' && !s.p.roomId)?.p;
    await wait(1500);
    const chunks = sink.filter((s) => s.ch === 'message-stream-chunk');
    out.a2_dmQueue = {
      queued: !!q,
      waitingForBotWake: !!q && q.waitingForWakeIds.includes(botWakeId),
      dmAnswered: chunks.some((c) => c.p.done),
      streamErrors: sink.filter((s) => s.ch === 'message-stream-error').length,
    };
  }

  // (c) cancel-wake-chain on the bot chain leaves the queued user wake intact.
  {
    const mark = windowSends.length;
    const sink = [];
    const { botChainId, botWakeId } = await startBotChain(room.id, sink);
    await handlers['send-room-message-stream'](fakeEvent(sink), room.id, 'again @Coder', undefined);
    await wait(30);
    const q = since(mark).find((s) => s.ch === 'wake-user-queued')?.p;
    const cancel = await handlers['cancel-wake-chain'](null, botChainId);
    await wait(800);
    const cancelledIds = since(mark).filter((s) => s.ch === 'wake-cancelled').map((s) => s.p.wakeId);
    out.c_botChainCancel = {
      cancelOk: cancel.success,
      botWakeCancelled: cancelledIds.includes(botWakeId),
      userWakeCancelled: !!q && cancelledIds.includes(q.wakeId),
      userWakeRan: !!(q && doneAt(sink, q.wakeId)),
    };
  }

  // (d) Remy: requestAgentWake on Coder while Coder only waits for a user message.
  {
    const mark = windowSends.length;
    const sink = [];
    const { botChainId } = await startBotChain(room.id, sink);
    await handlers['send-room-message-stream'](fakeEvent(sink), room.id, 'third @Coder', undefined);
    await wait(30);
    const q = since(mark).find((s) => s.ch === 'wake-user-queued')?.p;
    const userBudgetBefore = q ? bus.getChainWakeCount(q.chainId) : -1;
    const queuedNow = bus.getQueuedUserWakes().some((w) => w.wakeId === q?.wakeId);
    const req = await handlers['request-agent-wake'](null, ASSISTANT, CODER, 'please check', room.id);
    const reqStarted = since(mark).find((s) => s.ch === 'wake-started' && s.p.wakeId === req.wakeId)?.p;
    const userBudgetAfter = q ? bus.getChainWakeCount(q.chainId) : -1;
    await wait(1500);
    const ev = since(mark);
    out.d_remyRequestOnQueuedAgent = {
      targetWasQueuedForUser: queuedNow,
      requestOk: req.success === true,
      alreadyInFlightSkips: ev.filter((s) => s.ch === 'wake-order-skip' && s.p.reason === 'already-in-flight').length,
      requestChainId: reqStarted?.chainId,
      requestNotOnUserChain: !!reqStarted && reqStarted.chainId !== q?.chainId,
      requestNotOnBotFanOutChain: !!reqStarted && reqStarted.chainId !== botChainId,
      userChainBudgetBefore: userBudgetBefore,
      userChainBudgetAfter: userBudgetAfter,
      userWakeRan: !!(q && doneAt(sink, q.wakeId)),
      requestSucceeded: ev.some((s) => s.ch === 'wake-success' || (s.ch === 'wake-started' && s.p.wakeId === req.wakeId)),
    };
  }

  // (e) The user can still cancel their own queued message: cancel-wake-chain on the queued chain.
  {
    const mark = windowSends.length;
    const sink = [];
    await startBotChain(room.id, sink);
    await handlers['send-room-message-stream'](fakeEvent(sink), room.id, 'fourth @Coder', undefined);
    await wait(30);
    const q = since(mark).find((s) => s.ch === 'wake-user-queued')?.p;
    const cancel = q ? await handlers['cancel-wake-chain'](null, q.chainId) : { success: false };
    await wait(1200);
    out.e_cancelOwnQueued = {
      cancelOk: cancel.success,
      queuedWakeCancelled: !!q && since(mark).some((s) => s.ch === 'wake-cancelled' && s.p.wakeId === q.wakeId),
      userWakeRan: !!(q && doneAt(sink, q.wakeId)),
      budgetFreed: q ? bus.getChainWakeCount(q.chainId) === 0 : false,
      noLeftoverQueue: bus.getQueuedUserWakes().length === 0,
    };
  }

  // Bot-triggered dedupe is unchanged: a second requestAgentWake to the same in-flight target in the same root chain is skipped.
  {
    const mark = windowSends.length;
    const r1 = await handlers['request-agent-wake'](null, '2', CODER, 'x', room.id);
    const r2 = await handlers['request-agent-wake'](null, '2', CODER, 'y', room.id);
    await wait(400);
    out.botDedupeKept = { first: r1.success, secondSkipped: r2.success === false && since(mark).some((s) => s.ch === 'wake-order-skip' && s.p.reason === 'already-in-flight') };
  }

  const A = out.a_queueAfterInFlight, B = out.b_ownChainAndBudget, A2 = out.a2_dmQueue, C = out.c_botChainCancel, D = out.d_remyRequestOnQueuedAgent;
  out.pass =
    A.queuedEvents === 1 && A.waitingForBotWake && A.alreadyInFlightSkips === 0 && A.userWakeRan && A.startedAfterBotDone &&
    B.distinctFromBotChain && B.distinctFromIncomingChain && B.startedCarriesQueuedChain && B.queuedChainBudgetWhileWaiting === 1 && B.budgetFreedAfterEnd &&
    A2.queued && A2.waitingForBotWake && A2.dmAnswered && A2.streamErrors === 0 &&
    C.cancelOk && C.botWakeCancelled && !C.userWakeCancelled && C.userWakeRan &&
    D.targetWasQueuedForUser && D.requestOk && D.alreadyInFlightSkips === 0 && D.requestNotOnUserChain && D.userChainBudgetBefore === 1 && D.userChainBudgetAfter === 1 && D.userWakeRan &&
    out.e_cancelOwnQueued.cancelOk && out.e_cancelOwnQueued.queuedWakeCancelled && !out.e_cancelOwnQueued.userWakeRan && out.e_cancelOwnQueued.budgetFreed && out.e_cancelOwnQueued.noLeftoverQueue &&
    out.botDedupeKept.first && out.botDedupeKept.secondSkipped;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
