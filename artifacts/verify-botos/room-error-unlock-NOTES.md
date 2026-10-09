# Room error unlock (follow-up to #50, Remy HARD #1 Team Chat lock)

## Root cause
- When a provider fails in the ordered room fan-out, the bus emits only `wake-order-skip`. RoomView never subscribed to it, so `isLoading` stayed stuck.
- The sender stream and the ordered fan-out `.catch` blocks only logged the error, so the renderer never heard about it.

## Fix
- New `room-stream-error` IPC (`onRoomStreamError`), sent from both catch paths.
- RoomView listens to `onWakeOrderSkip` and `onRoomStreamError`. It shows an error chip, clears the stream and unlocks the composer.

## Not run
- Manual desktop repro: a fake OpenAI key on a room member, then @mention it in Team Chat. This needs verify-botos.
