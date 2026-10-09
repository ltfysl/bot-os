# Provider error unlock (Remy Friday sweep HARD #1)

## Root cause
- main sent `message-stream-error`, but ChatView never subscribed, so `isLoading` stayed true and the "..." bubble never cleared.
- ChatView is not remounted per agent, so the stuck `isLoading` locked every DM.
- Provider `fetch` had no timeout, so a slow or hung endpoint never settled.

## Fix
- ChatView subscribes to `onMessageStreamError`: clears the stream, unlocks the composer, and appends an `Error: ...` message (for example `OpenAI API error 401`).
- `isLoading` and the stream reset on agent switch.
- All provider fetches use `AbortSignal.timeout(30000)`.

## Not covered
- Team Chat lock: RoomView has its own `isLoading` and there's no room error event yet. Needs a repro after this lands.
- Manual UI repro (fake OpenAI key, then 401) is not run here; needs verify-botos on desktop.
