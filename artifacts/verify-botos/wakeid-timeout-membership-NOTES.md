# wakeId on timeout + membership-denied

## Remy #47 soft
timeout / membership IPC lacked wakeId for Square.

## Change
- `WakeTimeoutEvent.wakeId?` + `WakeMembershipDeniedEvent.wakeId?`
- Mint wakeId before mention membership checks; ordered/requestAgentWake reuse existing ids
- Timeout emits (stream + non-stream + bot-wake) include wakeId
- IPC: `timeoutMs` branch (was dropped before) + forward wakeId on timeout/membership
