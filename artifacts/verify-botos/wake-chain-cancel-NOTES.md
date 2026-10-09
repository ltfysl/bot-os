# Wake chain cancel (bus slice after #41)

## What
One cancel for a whole ordered wake chain (room @mention fan-out) instead of one cancel per wake.

- Every ordered fan-out gets a `chainId`. Room sends return it (`{ ...userMessage, chainId }`), and `wake-started` carries it.
- `cancelWakeChain(chainId)` / IPC `cancel-wake-chain`: cancels the wake in flight (one `wake-cancelled`), starts no later target, and emits one `wake-chain-cancelled` with `skippedAgentIds`.
- A second cancel on the same chain is a no-op (`cancelled: false`).
- Fix: a non-stream ordered wake cancelled mid-call no longer posts its late reply or emits `wake-success`.

## Evidence (headless: `npm run build`, then `node artifacts/verify-botos/wake-chain-cancel-harness.js`)
Three targets a, b, c on a 300ms provider. The chain is cancelled at 100ms.
- cancel returns `cancelled: true` and `skippedAgentIds: ["b","c"]`
- completed `[]`
- events are `started`, `cancelled`, `chain-cancelled`, with no `wake-success` and no `wake-order-skip`
- second cancel returns `cancelled: false`

## Not in scope
The renderer Stop button for the whole chain is Vale's Cancel-Chrome. It can call `cancelWakeChain(chainId)`.
