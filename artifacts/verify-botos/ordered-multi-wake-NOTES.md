# ordered multi-wake (rebuilt on post-#40 main)

## Why rebuild
Original #41 diverged heavily from main after #38–#40 (wakeId/cancel). Rebased by resetting branch to main and re-applying only ordered multi-wake.

## API
- `AgentBus.enqueueOrderedWakes(targets, initiatorAgentId?, roomId?, onChunk?)`
- Sequential: each wake completes (or skips) before next
- Fail-closed membership when `roomId` set
- Emits `wake-started` + `wake-order-skip` (`kind: 'order-skip'`) with `orderPosition`
- Uses existing `enqueueWake` / cancel-safe wakeIds from #40

## IPC
- `wake-order-skip` → preload `onWakeOrderSkip`

## Build
type-check + build green on tip after this commit.
