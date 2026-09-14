# Wake Cancel/Abort IPC Implementation Notes

## Overview
Implemented cancel/abort functionality for in-flight wakes and streams on the Agent Communication Bus with proper slot release and clear event emission.

## Changes Made

### 1. Agent Bus Core (`src/main/agent-bus.ts`)

#### New Types & Events
- **WakeFailureReason**: Added `'cancelled'` reason
- **WakeCancelledEvent**: New event type with:
  - `wakeId`: Unique identifier for the wake
  - `targetAgentId`: Agent being woken
  - `initiatorAgentId?`: Optional agent that initiated the wake
  - `roomId?`: Optional room context
  - `timestamp`: Event timestamp

#### Wake ID Tracking
- **activeWakeIds Map**: Tracks all in-flight wakes (both active and queued)
  - Key: `wakeId` (format: `wake-{timestamp}-{targetAgentId}-{random}`)
  - Value: `{ targetAgentId, initiatorAgentId?, roomId?, cancelled: boolean }`
- **wakeQueue Array**: Enhanced with `wakeId` field for each queued wake

#### Cancel Semantics
- **`cancelWake(wakeId: string)`**: Public method that:
  1. **For active wakes**: Sets `cancelled` flag, emits `WakeCancelledEvent`, returns status
  2. **For queued wakes**: Removes from queue, deletes from tracking, rejects promise, emits event
  3. **Cancellation checks**: Inserted in:
     - `_wakeAgentInternal`: Before provider call and after availability check
     - `_wakeAgentStreamInternal`: Before each chunk delivery
  
#### Slot Release Guarantees
- Active wake cancellation: Flag prevents further work, slot released in `finally` block
- Queued wake cancellation: Immediate removal from queue, no slot consumed
- All cancelled wakes cleaned from `activeWakeIds` map
- Queue processing continues normally after cancellation

#### No Late Chunks
- Streaming wakes check `cancelled` flag before each chunk delivery
- Cancelled wakes throw `'Wake cancelled'` error immediately
- Error propagates to `catch` block which emits proper `WakeFailureEvent` with `reason: 'cancelled'`

#### Integration Points
- `sendMessageWithWake`: Tracks wake IDs for @mention-triggered wakes
- `sendMessageWithWakeStream`: Tracks wake IDs for streaming @mention wakes
- `requestAgentWake`: Tracks wake IDs for bot-initiated wakes
- `enqueueWake`: Enhanced with wake ID tracking and metadata
- `processWakeQueue`: Cleans up wake IDs on completion

### 2. IPC Layer (`src/main/main.ts`)

#### New Handler
```typescript
ipcMain.handle('cancel-wake', async (_event, wakeId: string) => {
  const result = agentBus.cancelWake(wakeId);
  return { 
    success: result.cancelled,
    wasActive: result.wasActive,
    wasQueued: result.wasQueued
  };
});
```

#### Event Emission
- Added `wake-cancelled` event emission in wake event router
- Checked via `'wakeId' in event` discriminator (before other event types)
- Sends full `WakeCancelledEvent` to renderer

### 3. Preload Bridge (`src/main/preload.ts`)

#### Exposed API
- **`cancelWake(wakeId: string): Promise<CancelWakeResult>`**
  - Returns: `{ success, wasActive, wasQueued, error? }`
- **`onWakeCancelled(callback): (() => void)`**
  - Event listener for `WakeCancelledEvent`
  - Returns unsubscribe function

#### Types
- `WakeFailureReason`: Added `'cancelled'`
- `WakeCancelledEvent`: Mirror of agent-bus type
- `CancelWakeResult`: Response type for cancel operation

### 4. Renderer Types (`src/renderer/types.ts`)

#### Window API Extension
- `window.electronAPI.cancelWake(wakeId: string): Promise<CancelWakeResult>`
- `window.electronAPI.onWakeCancelled(callback): (() => void)`

#### Type Definitions
- All types mirrored from preload layer
- Full type safety for renderer consumption

## Membership & Backpressure Invariants (from PR #38)

### Preserved Guarantees
1. **Fail-closed membership**: Cancellation respects room membership checks (no bypass)
2. **Backpressure limits**: Cancel doesn't corrupt queue state or slot counts
3. **Slot accounting**: 
   - Active cancels: Slot released in `finally` block (same path as completion)
   - Queued cancels: Slot never taken, removed from queue cleanly
4. **No stuck slots**: All paths (success, error, cancel) release slots via `finally`
5. **No late chunks**: Streaming checks `cancelled` flag before each chunk emission

### Queue Integrity
- Queue drops use same cleanup path as successful completion
- Cancelled wakes don't block queue processing
- `processWakeQueue()` continues draining after cancellation

## Cancel Flow Examples

### Example 1: Cancel Active Streaming Wake
1. User sends message with `@agent`
2. Wake starts streaming, `wakeId` tracked in `activeWakeIds`
3. Renderer calls `window.electronAPI.cancelWake(wakeId)`
4. IPC handler calls `agentBus.cancelWake(wakeId)`
5. Bus sets `cancelled: true` flag in `activeWakeIds`
6. Next chunk check sees `cancelled === true`, throws error
7. Error caught, emits `WakeFailureEvent` with `reason: 'cancelled'`
8. `finally` block deletes from `activeWakeIds`, releases slot
9. Bus emits `WakeCancelledEvent` to renderer
10. Renderer receives event via `onWakeCancelled` listener

### Example 2: Cancel Queued Wake
1. Queue at capacity, new wake enqueued with `wakeId`
2. Wake sits in `wakeQueue` array, tracked in `activeWakeIds`
3. Renderer calls `cancelWake(wakeId)`
4. Bus finds wake in queue via `findIndex`
5. Removes from queue with `splice`
6. Deletes from `activeWakeIds`
7. Calls queued wake's `reject()` with cancellation error
8. Emits `WakeCancelledEvent` to renderer
9. No slot ever consumed, queue continues processing

## Secret Safety
- No secrets exposed in wake cancel API
- `wakeId` is an opaque identifier, reveals no provider details
- Cancel result only returns status flags (boolean)
- Event payloads contain only agent/room IDs (already known to renderer)

## Build Verification
```bash
npm run build
# Output: ✓ built in 2003ms (TypeScript + Vite, no errors)
```

## Type Coverage
- Agent bus: Full coverage with explicit `WakeCancelledEvent` type
- IPC handlers: Typed request/response
- Preload: Full `contextBridge` types
- Renderer: Full `window.electronAPI` types

## Remaining Work (Out of Scope per Spec)
- **UI Chrome**: No cancel buttons added (Vale owns chrome layer)
- **React Integration**: No React components modified (runtime/IPC layer only)
- **Provider work**: No provider-level cancellation (shallow cancel at bus layer)

## Next Steps for Vale (Chrome Owner)
1. Add cancel button UI in `ChatView.tsx` / `RoomView.tsx`
2. Track wake IDs from stream responses
3. Call `window.electronAPI.cancelWake(wakeId)` on button click
4. Handle `onWakeCancelled` events for UI feedback
5. Show cancellation state in message bubbles

## Testing Notes
- Typecheck: ✓ Passes
- Build: ✓ Green
- Manual testing: Requires UI chrome (deferred per spec)
- Unit tests: Not added (per scope constraint: runtime/IPC/types only)

## Commit Summary
- Runtime: Wake tracking, cancellation method, slot cleanup
- IPC: `cancel-wake` handler, `wake-cancelled` event
- Preload: API exposure with secret-safe types
- Types: Full type coverage renderer ↔ main
- Build: Green with no errors

---

**Draft PR Ready**: Yes  
**Semantics Documented**: Yes  
**Builds Green**: Yes  
**Scope Respected**: Yes (NO React/CSS chrome)
