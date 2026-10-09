# Wake depth guard (bus slice after #55)

## Today on main
A wake loop isn't possible yet. @mentions are only resolved from the sender's message, never from replies of woken agents, and room chains run with `skipWakeFanOut`. The only bot-to-bot path is `requestAgentWake` (IPC). This guard is in place before bot replies can wake other agents themselves.

## Change
- Each wake registry entry carries `depth` (a root wake is 1).
- `requestAgentWake(..., parentWakeId?)`: **the bus derives the parent itself** (Remy). It takes the deepest active wake whose target is the initiator, and the depth is that wake's depth plus 1. A caller `parentWakeId` can only raise the depth, never lower it. Leaving it out does not reset the chain to 0.
- `MAX_WAKE_DEPTH = 4`. Above that, no wake runs: one `wake-depth-exceeded` event (`depth`, `maxDepth`, `parentWakeId`, `targetAgentId`) and an error back to the caller.
- New IPC `onWakeDepthExceeded`. The preload passes `parentWakeId` through.

## Evidence (`npm run build`, then `node artifacts/verify-botos/wake-depth-guard-harness.js`)
Chain u, a, b, c, d, e with every hop while the previous wake is still active and no `parentWakeId` from any caller:
- u to a, a to b, b to c, c to d: ok (depth 1 to 4)
- d to e: blocked `Wake depth exceeded (5 > 4)`
- d to f with a forged `parentWakeId`: also blocked, so the forged value can't lower the depth
- `depth-exceeded` emitted twice with `depth 5 / max 4` and a derived parent

## Not in scope
UI for `wake-depth-exceeded`. Vale can show it as a wake-error row.
