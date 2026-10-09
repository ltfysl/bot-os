// Headless harness: run after `npm run build`.
const { AgentBus } = require('../../dist/main/agent-bus.js');
const events = [];
const bus = new AgentBus({ providers: [], defaultProviderId: 'p', onWakeEvent: (e) => events.push(e) });
let release;
const gate = new Promise((r) => (release = r));
bus.registerProvider({ id: 'p', name: 'P', isAvailable: async () => true, sendMessage: () => gate.then(() => 'ok') });
for (const id of ['u', 'a', 'b', 'c', 'd', 'e', 'f']) bus.registerAgent({ id, name: id, providerId: 'p', avatar: id, status: 'idle', unread: 0 });
(async () => {
  const log = (label, p) => p.then((r) => console.log(label, 'ok', r.wakeId ? 'wake' : r)).catch((e) => console.log(label, 'blocked', e.message));
  // Chain a->b->c->d->e. Each hop runs while the previous wake is still active.
  // No caller passes parentWakeId, so the bus must derive depth on its own.
  await log('u->a depth1', bus.requestAgentWake('u', 'a', 'x'));
  await log('a->b depth2', bus.requestAgentWake('a', 'b', 'x'));
  await log('b->c depth3', bus.requestAgentWake('b', 'c', 'x'));
  await log('c->d depth4', bus.requestAgentWake('c', 'd', 'x'));
  await log('d->e depth5', bus.requestAgentWake('d', 'e', 'x'));
  // A forged root hint cannot lower the depth.
  await log('d->f forged root', bus.requestAgentWake('d', 'f', 'x', undefined, 'not-a-real-wake'));
  const ex = events.filter((e) => e.kind === 'depth-exceeded');
  console.log('depth-exceeded', JSON.stringify(ex.map((e) => ({ t: e.targetAgentId, depth: e.depth, max: e.maxDepth, parent: Boolean(e.parentWakeId) }))));
  release();
  setTimeout(() => process.exit(0), 300);
})();
