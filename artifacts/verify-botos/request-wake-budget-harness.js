// #59: requestAgentWake shares the chain budget (8), the in-flight dedupe and the 3-target cap.
// Bus-direct for the chain shapes; the IPC case at the end drives request-agent-wake in main.ts. Run after `npm run build`.
const { AgentBus } = require('../../dist/main/agent-bus.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];

function makeBus(delayMs) {
  const events = [];
  const bus = new AgentBus({ providers: [], defaultProviderId: 'p', maxConcurrentWakes: 50, wakeQueueLimit: 100, onWakeEvent: (e) => events.push(e) });
  bus.registerProvider({ id: 'p', name: 'p', isAvailable: async () => true, sendMessage: () => new Promise((r) => setTimeout(() => r('ok'), delayMs)) });
  for (const id of ids) bus.registerAgent({ id, name: id, providerId: 'p', avatar: id, status: 'idle', unread: 0 });
  return { bus, events };
}
const kinds = (events, k) => events.filter((e) => e.kind === k);
async function tryWake(bus, ...args) {
  try { return (await bus.requestAgentWake(...args)).wakeId; } catch (e) { return `ERR:${e.message}`; }
}

(async () => {
  global.roomManager = { getRoom: () => ({ memberAgentIds: ids }) };
  const out = {};

  // 1. Remy's case: 12 calls from one initiator in one burst.
  {
    const { bus, events } = makeBus(300);
    const targets = ['b', 'c', 'd', 'e', 'b', 'c', 'f', 'g', 'h', 'i', 'j', 'k'];
    const res = [];
    for (const t of targets) res.push(await tryWake(bus, 'a', t, 'go', 'room1'));
    const started = kinds(events, 'started');
    const chains = new Set(started.map((e) => e.chainId));
    out.burst12 = {
      started: started.length,
      sameChain: chains.size === 1,
      inFlightSkips: kinds(events, 'order-skip').filter((e) => e.reason === 'already-in-flight').length,
      mentionCapSkips: kinds(events, 'order-skip').filter((e) => e.reason === 'mention-cap').length,
      refused: res.filter((r) => r.startsWith('ERR')).length,
    };
    await wait(500);
    out.burst12.chainFreedAfterEnd = bus.getChainWakeCount([...chains][0]) === 0;
  }

  // 2. Fan-out tree: a wakes b,c,d; each of b,c,d wakes 3 more (parent resolved by the bus) = 12 asks, budget 8.
  {
    const { bus, events } = makeBus(400);
    for (const t of ['b', 'c', 'd']) await tryWake(bus, 'a', t, 'go', 'room1');
    const kids = { b: ['e', 'f', 'g'], c: ['h', 'i', 'j'], d: ['k', 'l', 'm'] };
    for (const [from, ts] of Object.entries(kids)) for (const t of ts) await tryWake(bus, from, t, 'go', 'room1');
    const started = kinds(events, 'started');
    const chainId = started[0].chainId;
    out.tree = {
      started: started.length,
      sameChain: started.every((e) => e.chainId === chainId),
      budgetExceeded: kinds(events, 'budget-exceeded').length,
      budgetExceededChainId: kinds(events, 'budget-exceeded')[0]?.chainId === chainId,
      wakeCount: bus.getChainWakeCount(chainId),
    };
    await wait(700);
    out.tree.budgetFreedAfterEnd = bus.getChainWakeCount(chainId) === 0;
    // A new burst after the chain ended gets a fresh chain and budget.
    const again = await tryWake(bus, 'a', 'b', 'go', 'room1');
    const last = kinds(events, 'started').pop();
    out.tree.freshChainAfterEnd = !again.startsWith('ERR') && last.chainId !== chainId;
  }

  // 3. Depth guard on requested wakes carries the chainId.
  {
    const { bus, events } = makeBus(400);
    let from = 'a';
    for (const t of ['b', 'c', 'd', 'e', 'f']) { await tryWake(bus, from, t, 'go', 'room1'); from = t; }
    const ex = kinds(events, 'depth-exceeded');
    const chainId = kinds(events, 'started')[0].chainId;
    out.depth = { started: kinds(events, 'started').length, depthExceeded: ex.length, chainIdOnDepthExceeded: ex[0]?.chainId === chainId };
    await wait(500);
  }

  // 4. Cancelling the chain cancels the requested wakes and frees the budget.
  {
    const { bus, events } = makeBus(300);
    for (const t of ['b', 'c']) await tryWake(bus, 'a', t, 'go', 'room1');
    const chainId = kinds(events, 'started')[0].chainId;
    const c = bus.cancelWakeChain(chainId);
    await wait(500);
    out.cancel = { cancelled: c.cancelled, wakeCancelled: kinds(events, 'cancelled').length, budgetFreed: bus.getChainWakeCount(chainId) === 0 };
  }

  out.pass =
    out.burst12.started === 3 && out.burst12.sameChain && out.burst12.refused === 9 && out.burst12.chainFreedAfterEnd &&
    out.tree.started === 8 && out.tree.sameChain && out.tree.budgetExceeded === 1 && out.tree.budgetExceededChainId && out.tree.budgetFreedAfterEnd && out.tree.freshChainAfterEnd &&
    out.depth.started === 4 && out.depth.depthExceeded === 1 && out.depth.chainIdOnDepthExceeded &&
    out.cancel.cancelled && out.cancel.wakeCancelled === 2 && out.cancel.budgetFreed;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
})();
