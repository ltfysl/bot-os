# wakeId on wake-failure

## Why
Square needs stable attribution when a wake fails (timeout path excluded — separate IPC; cancel uses wake-cancelled only).

## Change
- `WakeFailureEvent.wakeId?: string` on bus + preload + renderer types
- Populate on mention/stream catch, `requestAgentWake` catch, queue-drop, and pre-start agent-not-found (mint early via `generateWakeId`)
- IPC `wake-failure` forwards `wakeId`
