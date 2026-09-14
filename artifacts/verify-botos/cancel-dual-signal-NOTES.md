# cancel dual-signal cleanup

## Problem
`cancelWake` emits `wake-cancelled`, then the in-flight wake throws and catch paths also emitted `wake-failure` with `reason: 'cancelled'` (and ordered path could `wake-order-skip`).

## Fix
On cancel errors, skip failure/order-skip emits. UI should settle on `onWakeCancelled` only.
