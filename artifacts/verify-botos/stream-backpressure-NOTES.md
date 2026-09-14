# Streaming Backpressure End-to-End — Implementation Notes

**Slice**: After #36 (Orin)  
**Date**: 2026-09-14  
**Status**: ✅ Complete  
**Rebased**: 2026-09-14 onto main @ 6eff282 (after #37 wake-error chrome)  
**Tip SHA**: 9c5cc85

---

## Goal

Wire streaming wake / fan-in paths to the same wake queue + backpressure from #35 so streams cannot bypass concurrency limits. Emit `wake-backpressure` when a stream-wake is queued/throttled. Respect membership checks before stream start.

---

## Implementation Summary

### ✅ Changes Made

1. **Refactored `enqueueWake` to return Promise** (lines 607-643)
   - Now returns `Promise<void>` that resolves when wake completes or is dropped
   - Queue entries store `resolve/reject` callbacks
   - Dropped wakes (when queue full) reject with error and emit `wake-failure`
   - `processWakeQueue` calls `resolve()` on success, `reject(err)` on failure

2. **Made `requestAgentWake` use backpressure queue** (lines 315-433)
   - Moved timeout logic + `_wakeAgentInternal` call inside `wakeFn`
   - Awaits `enqueueWake(targetAgentId, wakeFn)`
   - Now respects `maxConcurrentWakes` limit (default: 10)
   - Emits `wake-backpressure` when queued (via `enqueueWake`)

3. **Added membership checks BEFORE enqueueing** 
   - **Streaming wakes** (lines 234-250): Check room membership before calling `enqueueWake`
   - **Non-streaming wakes** (lines 165-181): Check room membership before calling `enqueueWake`
   - Extract `roomId` from `context.room` or `context.roomId`
   - Emit `wake-membership-denied` and skip enqueueing if target not a member
   - No wasted queue slots on non-members

4. **Stream error handling verified**
   - `enqueueWake` has try/finally (lines 612-618) that always decrements `activeWakes`
   - Stream errors/timeouts caught in `wakeFn` try/catch (lines 230-291)
   - Slots are properly released on stream abort/error
   - `processWakeQueue` continues draining queue after failures

---

## Previous State (main @ 30a2e99)

### ✅ Already Backpressured

1. **`sendMessageWithWakeStream` mention wakes**: Used `enqueueWake()` ✅
2. **`sendMessageWithWake` mention wakes**: Used `enqueueWake()` ✅
3. **Room stream fan-in**: Called `sendMessageWithWakeStream` → `enqueueWake()` ✅
4. **`enqueueWake` emits `wake-backpressure`**: When queue is full ✅

### ❌ Issues Fixed

1. **`requestAgentWake` bypassed queue** → Now uses `enqueueWake()` ✅
2. **Membership checks happened inside wake function** → Now before enqueueing ✅
3. **Queue didn't return Promise** → Now awaitable for `requestAgentWake` ✅

---

## Technical Details

### Queue Promise Semantics

**Before**: `enqueueWake` returned `void`, fire-and-forget
**After**: Returns `Promise<void>`
- Resolves when wake completes (or is processed from queue)
- Rejects if dropped from full queue
- Fire-and-forget paths (mention wakes) don't await the promise
- Blocking paths (`requestAgentWake`) await the promise

### Membership Check Flow

```typescript
// Extract roomId from context
const roomId = context?.room || context?.roomId;

// Before enqueueing
if (roomId && room && !room.memberAgentIds.includes(targetAgentId)) {
  emitWakeEvent({ ..., denialReason: 'target-not-member' });
  return; // Skip this wake entirely
}

// Only queue if membership check passes
enqueueWake(targetAgentId, wakeFn);
```

### Error Propagation

```
wakeFn throws
  ↓
enqueueWake try/catch (lines 612-618) fires finally
  ↓
activeWakes-- + processWakeQueue()
  ↓
Promise rejects (for blocking paths)
  ↓
wake-failure event emitted (lines 270-290)
```

---

## Success Criteria

✅ `requestAgentWake` goes through `enqueueWake` (respects `maxConcurrentWakes`)  
✅ Room mention wakes check membership **before** enqueueing (no wasted slots)  
✅ `wake-backpressure` emitted when stream wake is queued (via `enqueueWake`)  
✅ `wake-membership-denied` emitted before stream starts (not mid-stream)  
✅ Stream abort/error releases slots + emits `wake-failure` (try/finally + processQueue)  
✅ Type-check passes  
✅ Build passes  
✅ NOTES file in artifacts/verify-botos/

---

## Files Modified

### `src/main/agent-bus.ts`

**Lines 92-96**: Updated `wakeQueue` type to include `resolve/reject`
**Lines 165-206**: Added membership check before enqueueing non-streaming wakes
**Lines 234-295**: Added membership check before enqueueing streaming wakes
**Lines 315-433**: Refactored `requestAgentWake` to use `enqueueWake`
**Lines 607-643**: Refactored `enqueueWake` to return Promise with resolve/reject
**Lines 645-663**: Updated `processWakeQueue` to call resolve/reject callbacks

**No changes to**:
- `main.ts`: Already passing `{ room: roomId }` context
- `preload.ts`: Wake event types already exist
- `renderer/`: No UI chrome (types only)

---

## Out of Scope

- Vale UI for backpressure chrome (queued/throttled indicators) — types only ✅
- New providers ✅
- DM-specific backpressure logic (DMs use `requestAgentWake` which is now fixed) ✅

---

## Testing Approach

Since no UI chrome, manual testing via DevTools console:

### Test 1: Backpressure on requestAgentWake

```javascript
// Listen for backpressure events
window.electronAPI.onWakeBackpressure((event) => {
  console.log(`[BACKPRESSURE] Queue position ${event.queuePosition}/${event.queueLength}, active: ${event.activeWakes}`);
});

// Flood with 20 targeted wakes (max 10 concurrent)
for (let i = 0; i < 20; i++) {
  window.electronAPI.requestAgentWake('1', '2', `Wake ${i}`, 'room-123');
}
// Expected: First 10 execute immediately, remaining 10 queue
// Should see 10 wake-backpressure events
```

### Test 2: Membership denial before enqueueing

```javascript
window.electronAPI.onWakeMembershipDenied((event) => {
  console.log('[DENIED]', event.targetAgentId, event.denialReason);
});

// Send message mentioning non-member in room
await window.electronAPI.sendRoomMessageStream(
  'room-123',
  'Hello @nonmember',
  '1'
);
// Expected: wake-membership-denied event immediately (no queue slot wasted)
```

### Test 3: Stream error slot release

```javascript
let activeCount = 0;
window.electronAPI.onWakeBackpressure((e) => {
  console.log(`Active: ${e.activeWakes}, Queued: ${e.queueLength}`);
});

// Send 15 messages (will queue 5 after 10 concurrent)
for (let i = 0; i < 15; i++) {
  window.electronAPI.sendMessageStream(
    'Trigger error @bot999',  // Non-existent agent
    '1',
    {}
  );
}
// Expected: Queue drains despite errors, activeWakes returns to 0
```

---

## Next Steps

- Manual testing via DevTools to confirm backpressure + membership checks
- Verify queue draining behavior under load
- Check wake-backpressure events fire correctly
- Confirm no queue slot leaks on errors

**Ready for**: Draft PR → Testing → Ready for Review
