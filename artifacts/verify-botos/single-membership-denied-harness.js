// Headless harness: a non-member mention gives exactly one signal and costs no budget. Run after `npm run build`.
const { AgentBus } = require('../../dist/main/agent-bus.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const events = [];
  const bus = new AgentBus({ providers: [], defaultProviderId: 'p', onWakeEvent: (e) => events.push(e) });
  for (const id of ['coder', 'outsider', 'u']) {
    bus.registerProvider({ id: `p-${id}`, name: id, isAvailable: async () => true, sendMessage: async () => 'ok' });
    bus.registerAgent({ id, name: id, providerId: `p-${id}`, avatar: id, status: 'idle', unread: 0 });
  }
  global.roomManager = { getRoom: () => ({ memberAgentIds: ['coder', 'u'] }) };
  const chain = bus.createWakeChainId();
  let midCount = null;
  const run = bus.enqueueOrderedWakes([{ agentId: 'outsider', message: 'hi' }, { agentId: 'coder', message: 'hi' }], 'u', 'room1', undefined, () => { midCount = bus.getChainWakeCount(chain); }, chain);
  await run; await wait(100);
  const forOutsider = events.filter((e) => e.targetAgentId === 'outsider');
  console.log(JSON.stringify({
    outsiderSignals: forOutsider.map((e) => e.kind || (e.denialReason ? 'membership-denied' : 'other')),
    orderSkipsForOutsider: forOutsider.filter((e) => e.kind === 'order-skip').length,
    coderStarted: events.some((e) => e.kind === 'started' && e.targetAgentId === 'coder'),
    chainWakesWhileCoderRan: midCount,
  }, null, 2));
})();
