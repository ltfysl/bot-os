# dual timeout-router cleanup

## Problem
Timeout emitted `WakeTimeoutEvent` (`timeoutMs`) then catch also emitted `wake-failure`/`wake-order-skip` with reason timeout. IPC also dual-routed `reason === 'timeout'` → `wake-timeout`.

## Fix
- Catch paths: skip failure/order-skip on timeout (settle on `onWakeTimeout` only)
- IPC: single `timeoutMs` branch
