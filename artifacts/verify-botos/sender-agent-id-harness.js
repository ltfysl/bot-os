// Headless harness for senderAgentId + stable wake bubble id. Run after `npm run build`.
// Drives the bus path that main.ts maps onto message-stream-chunk / wake-stream-chunk.
const { AgentBus } = require('../../dist/main/agent-bus.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const bus = new AgentBus({ providers: [], defaultProviderId: 'p', onWakeEvent: () => {} });
  const stream = (text) => async (_m, _c, onChunk) => {
    for (const t of text.split(' ')) { await wait(5); onChunk(t + ' ', false); }
    onChunk('', true);
    return text;
  };
  for (const [id, text] of Object.entries({ coder: 'ask @assistant please', assistant: 'sure thing here' })) {
    bus.registerProvider({ id: `p-${id}`, name: id, isAvailable: async () => true,
      sendMessage: async () => text, sendMessageStream: stream(text) });
    bus.registerAgent({ id, name: id, providerId: `p-${id}`, avatar: id, status: 'idle', unread: 0 });
  }
  const primary = [];
  const woken = [];
  // Same mapping as main.ts: senderAgentId = streamAgentId / wokeAgentId, id = wakeId.
  await bus.sendMessageWithWakeStream('hi @assistant', 'coder', undefined,
    (agentId, chunk, done, wakeId) => primary.push({ senderAgentId: agentId, targetAgentId: 'coder', wakeId, done }),
    (agentId, chunk, done, wakeId) => woken.push({ id: wakeId, senderAgentId: agentId, targetAgentId: 'coder', done }));
  await wait(500);
  const out = {
    primaryChunks: primary.length,
    primarySenders: [...new Set(primary.map((c) => c.senderAgentId))],
    wokenChunks: woken.length,
    wokenSenders: [...new Set(woken.map((c) => c.senderAgentId))],
    wokenIds: [...new Set(woken.map((c) => c.id))],
    senderDiffersFromTarget: woken.every((c) => c.senderAgentId !== c.targetAgentId),
  };
  console.log(JSON.stringify(out, null, 2));
})();
