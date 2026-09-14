# backpressure metrics IPC (read-only)

## API
- `agentBus.getWakeQueueStats()` already existed
- New IPC: `get-wake-backpressure-stats` → preload/renderer `getWakeBackpressureStats()`
- Returns `{ active, queued, queueLimit, maxConcurrent }` — no secrets

## Scope
Read-only. No React/CSS. No provider changes.
