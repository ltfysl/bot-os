# WakeSuccessEvent / streaming fan-in settle (rebuilt on post-#41 main)

## What
- `WakeSuccessEvent` (`kind: 'success'`) with optional `wakeId`, `streaming` flag
- Emitted after successful mention wakes (stream + non-stream), `requestAgentWake`, and ordered room fan-out
- IPC: `wake-success` → `onWakeSuccess`
- Exactly one terminal success per successful wake path (failures still use wake-failure / order-skip / cancelled)

## Rebuild note
Original #43 diverged from #40/#41; re-applied onto current main without conflicting wakeId infra.
