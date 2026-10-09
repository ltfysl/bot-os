// Headless harness for bot-to-bot @mention wakes. Run after `npm run build`.
const { AgentBus } = require('../../dist/main/agent-bus.js');

function makeBus(replies, delayMs = 20) {
  const events = [];
  const done = [];
  const bus = new AgentBus({ providers: [], defaultProviderId: 'p', onWakeEvent: (e) => events.push(e) });
  for (const [id, reply] of Object.entries(replies)) {
    bus.registerProvider({ id: `p-${id}`, name: id, isAvailable: async () => true,
      sendMessage: () => new Promise((r) => setTimeout(() => r(reply), delayMs)) });
    bus.registerAgent({ id, name: id, providerId: `p-${id}`, avatar: id, status: 'idle', unread: 0 });
  }
  const onComplete = (wakeId, agentId, msg, lineage) => done.push({ agentId, depth: lineage && lineage.depth, from: lineage && lineage.initiatorAgentId, chain: lineage && lineage.chainId });
  return { bus, events, done, onComplete };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const kinds = (events, k) => events.filter((e) => e.kind === k);

(async () => {
  global.roomManager = { getRoom: () => ({ memberAgentIds: ['coder', 'assistant', 'selfie', 'u'] }) };
  const results = {};

  // 1. Ping-pong: coder and assistant mention each other forever.
  {
    const { bus, events, done, onComplete } = makeBus({ coder: '@assistant your turn', assistant: '@coder your turn', u: '' });
    const chain = bus.createWakeChainId();
    await bus.enqueueOrderedWakes([{ agentId: 'coder', message: 'go' }], 'u', 'room1', undefined, onComplete, chain);
    await wait(600);
    const ex = kinds(events, 'depth-exceeded');
    results.pingPong = { replies: done.map((d) => `${d.agentId}@${d.depth}`), depthExceeded: ex.length, exceededAt: ex[0] && ex[0].depth, sameChain: done.every((d) => d.chain === chain) };
  }
  // 2. Self-mention does not wake itself.
  {
    const { bus, done, onComplete } = makeBus({ selfie: 'talking to @selfie', u: '' });
    await bus.enqueueOrderedWakes([{ agentId: 'selfie', message: 'go' }], 'u', 'room1', undefined, onComplete);
    await wait(200);
    results.selfMention = { replies: done.map((d) => d.agentId) };
  }
  // 3. Mentioning a non-member is refused like a user mention.
  {
    const { bus, events, done, onComplete } = makeBus({ coder: 'ask @outsider', outsider: 'hi', u: '' });
    await bus.enqueueOrderedWakes([{ agentId: 'coder', message: 'go' }], 'u', 'room1', undefined, onComplete);
    await wait(200);
    results.nonMember = { replies: done.map((d) => d.agentId), denied: events.filter((e) => e.denialReason).map((e) => e.targetAgentId) };
  }
  // 4. Cancelling the chain stops every reply-driven wake started after it.
  {
    const { bus, events, done, onComplete } = makeBus({ coder: '@assistant go', assistant: '@coder go', u: '' }, 80);
    const chain = bus.createWakeChainId();
    void bus.enqueueOrderedWakes([{ agentId: 'coder', message: 'go' }], 'u', 'room1', undefined, onComplete, chain);
    await wait(130); // coder done (depth 1), assistant in flight (depth 2)
    const c = bus.cancelWakeChain(chain);
    await wait(600);
    results.chainCancel = { cancelled: c.cancelled, replies: done.map((d) => `${d.agentId}@${d.depth}`), started: kinds(events, 'started').length, chainCancelled: kinds(events, 'chain-cancelled').length, recancel: bus.cancelWakeChain(chain).cancelled };
  }
  // 5. A failed parent still keeps its lineage in the main process.
  {
    const events = [];
    const bus = new AgentBus({ providers: [], defaultProviderId: 'p', onWakeEvent: (e) => events.push(e) });
    bus.registerProvider({ id: 'bad', name: 'bad', isAvailable: async () => true, sendMessage: async () => { throw new Error('OpenAI API error 401: Auth failed'); } });
    bus.registerAgent({ id: 'coder', name: 'coder', providerId: 'bad', avatar: 'c', status: 'idle', unread: 0 });
    bus.registerAgent({ id: 'u', name: 'u', providerId: 'bad', avatar: 'u', status: 'idle', unread: 0 });
    const chain = bus.createWakeChainId();
    await bus.enqueueOrderedWakes([{ agentId: 'coder', message: 'go' }], 'u', 'room1', undefined, undefined, chain, 3);
    const started = kinds(events, 'started')[0];
    results.failedParentLineage = bus.getWakeLineage(started.wakeId);
  }
  // 6. Remy's width case: 4 agents that all mention each other. Budget caps the chain at 8 wakes.
  {
    const all = '@w1 @w2 @w3 @w4';
    const { bus, events, done, onComplete } = makeBus({ w1: all, w2: all, w3: all, w4: all, u: '' }, 10);
    global.roomManager = { getRoom: () => ({ memberAgentIds: ['w1', 'w2', 'w3', 'w4', 'u'] }) };
    const chain = bus.createWakeChainId();
    await bus.enqueueOrderedWakes([{ agentId: 'w1', message: 'go' }], 'u', 'room1', undefined, onComplete, chain);
    await wait(1500);
    results.widthBudget = { providerWakes: done.length, chainWakes: bus.getChainWakeCount(chain), budgetExceeded: kinds(events, 'budget-exceeded').length, inFlightSkips: events.filter((e) => e.reason === 'already-in-flight').length };
  }
  // 7. Mention cap: one reply mentioning 5 agents wakes only the first 3 (text order).
  {
    const { bus, events, done, onComplete } = makeBus({ boss: 'ping @m5 @m1 @m2 @m3 @m4', m1: '', m2: '', m3: '', m4: '', m5: '', u: '' }, 10);
    global.roomManager = { getRoom: () => ({ memberAgentIds: ['boss', 'm1', 'm2', 'm3', 'm4', 'm5', 'u'] }) };
    await bus.enqueueOrderedWakes([{ agentId: 'boss', message: 'go' }], 'u', 'room1', undefined, onComplete);
    await wait(400);
    results.mentionCap = { woken: done.filter((d) => d.agentId !== 'boss').map((d) => d.agentId), capped: events.filter((e) => e.reason === 'mention-cap').map((e) => e.targetAgentId) };
  }
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})();
