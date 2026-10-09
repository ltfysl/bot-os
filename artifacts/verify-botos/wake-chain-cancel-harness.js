const { AgentBus } = require('../../dist/main/agent-bus.js');
const events = [];
const bus = new AgentBus({ providers: [], defaultProviderId: 'slow', onWakeEvent: (e) => events.push(e) });
bus.registerProvider({ id: 'slow', name: 'Slow', isAvailable: async () => true,
  sendMessage: (m) => new Promise((r) => setTimeout(() => r('ok ' + m), 300)) });
for (const id of ['a','b','c']) bus.registerAgent({ id, name: id, providerId: 'slow', avatar: id, status: 'idle', unread: 0 });
const chainId = bus.createWakeChainId();
const done = [];
const p = bus.enqueueOrderedWakes([{agentId:'a',message:'x'},{agentId:'b',message:'x'},{agentId:'c',message:'x'}], 'u', undefined, undefined, (w, a) => done.push(a), chainId);
setTimeout(() => console.log('cancel', JSON.stringify(bus.cancelWakeChain(chainId))), 100);
p.then(() => setTimeout(() => {
  console.log('completed', JSON.stringify(done));
  console.log('kinds', JSON.stringify(events.map((e) => e.kind || Object.keys(e).join(','))));
  console.log('second cancel', JSON.stringify(bus.cancelWakeChain(chainId)));
}, 500));
