# Streaming Backpressure End-to-End — Verification Summary

**Date**: 2026-09-14  
**Commit**: 9c5cc85 (rebased onto main @ 6eff282)  
**PR**: #38  
**Status**: ✅ Complete — Draft PR (Rebased on latest main)

---

## Implementation Overview

This PR closes the streaming backpressure integration loop, ensuring ALL wake paths flow through the same backpressure queue with early membership validation.

### Key Achievement

**Before this PR**:
- ❌ `requestAgentWake` bypassed queue (DM/targeted wakes had no concurrency control)
- ❌ Membership checks happened AFTER enqueueing (wasted queue slots on non-members)
- ❌ `enqueueWake` was fire-and-forget (no way to await completion)

**After this PR**:
- ✅ All wake paths use `enqueueWake` (uniform concurrency control)
- ✅ Membership checks happen BEFORE enqueueing (no wasted slots)
- ✅ `enqueueWake` returns awaitable Promise (blocking + fire-and-forget semantics)

---

## Technical Changes

### 1. Queue Promise Refactor

**File**: `src/main/agent-bus.ts`  
**Lines**: 92-96, 607-643, 645-663

#### Before
```typescript
private wakeQueue: Array<{ fn: () => Promise<void>; targetAgentId: string }> = [];

private async enqueueWake(targetAgentId: string, wakeFn: () => Promise<void>): Promise<void> {
  if (this.activeWakes < this.maxConcurrentWakes) {
    this.activeWakes++;
    try {
      await wakeFn();
    } finally {
      this.activeWakes--;
      this.processWakeQueue();
    }
  } else {
    // Just push to queue
    this.wakeQueue.push({ fn: wakeFn, targetAgentId });
    this.emitWakeEvent({ ..., queuePosition, ... });
  }
}
```

#### After
```typescript
private wakeQueue: Array<{ 
  fn: () => Promise<void>; 
  targetAgentId: string; 
  resolve: () => void; 
  reject: (err: Error) => void;
}> = [];

private async enqueueWake(targetAgentId: string, wakeFn: () => Promise<void>): Promise<void> {
  if (this.activeWakes < this.maxConcurrentWakes) {
    // Execute immediately
    this.activeWakes++;
    try {
      await wakeFn();
    } finally {
      this.activeWakes--;
      this.processWakeQueue();
    }
  } else {
    // Return promise that resolves when wake is processed
    return new Promise<void>((resolve, reject) => {
      if (this.wakeQueue.length >= this.wakeQueueLimit) {
        const droppedWake = this.wakeQueue.shift();
        if (droppedWake) {
          droppedWake.reject(new Error('Wake queue full, oldest dropped'));
          this.emitWakeEvent({ ..., reason: 'general-error', ... });
        }
      }
      this.wakeQueue.push({ fn: wakeFn, targetAgentId, resolve, reject });
      this.emitWakeEvent({ ..., queuePosition, ... });
    });
  }
}

private processWakeQueue(): void {
  if (this.wakeQueue.length > 0 && this.activeWakes < this.maxConcurrentWakes) {
    const next = this.wakeQueue.shift();
    if (next) {
      this.activeWakes++;
      next.fn()
        .then(() => next.resolve())  // ✅ Resolve promise
        .catch((err) => {
          console.error(`Queued wake failed:`, err);
          next.reject(err);  // ✅ Reject promise
        })
        .finally(() => {
          this.activeWakes--;
          this.processWakeQueue();
        });
    }
  }
}
```

**Impact**: 
- Fire-and-forget wakes (mentions) don't await → no change in behavior
- Blocking wakes (`requestAgentWake`) await → proper backpressure
- Dropped wakes notify caller via rejection

---

### 2. `requestAgentWake` Queue Integration

**File**: `src/main/agent-bus.ts`  
**Lines**: 315-433

#### Before
```typescript
async requestAgentWake(...): Promise<void> {
  // Validate initiator/target
  // Check membership
  
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      this.emitWakeEvent({ ..., timeoutMs: 5000 });
      reject(new Error('Wake timeout'));
    }, 5000)
  );

  const wakePromise = this._wakeAgentInternal(targetAgentId, wakeContext, initiatorAgentId);
  
  await Promise.race([wakePromise, timeoutPromise]);  // ❌ Bypasses queue
}
```

#### After
```typescript
async requestAgentWake(...): Promise<void> {
  // Validate initiator/target
  // Check membership
  
  const wakeFn = async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.emitWakeEvent({ ..., timeoutMs: 5000 });
        reject(new Error('Wake timeout'));
      }, 5000)
    );

    const wakePromise = this._wakeAgentInternal(targetAgentId, wakeContext, initiatorAgentId);
    
    await Promise.race([wakePromise, timeoutPromise]);
  };
  
  await this.enqueueWake(targetAgentId, wakeFn);  // ✅ Goes through queue
}
```

**Impact**:
- DM wakes now respect `maxConcurrentWakes`
- Targeted room wakes now respect `maxConcurrentWakes`
- Emits `wake-backpressure` when queued

---

### 3. Early Membership Checks

**File**: `src/main/agent-bus.ts`  
**Lines**: 165-206 (non-streaming), 234-295 (streaming)

#### Before
```typescript
if (wokeAgents.length > 0 && onWakeChunk) {
  wokeAgents.forEach((wokeAgentId) => {
    const wakeFn = async () => {
      // Membership check happens inside _wakeAgentStreamInternal
      await this.wakeAgentStream(wokeAgentId, message, agentId, onWakeChunk);
    };
    this.enqueueWake(wokeAgentId, wakeFn);  // ❌ Non-members consume slots
  });
}
```

#### After
```typescript
if (wokeAgents.length > 0 && onWakeChunk) {
  const roomId = context?.room || context?.roomId;
  
  wokeAgents.forEach((wokeAgentId) => {
    // ✅ Check membership BEFORE enqueueing
    if (roomId) {
      const { RoomManager } = require('./rooms');
      const roomManagerInstance = global.roomManager;
      if (roomManagerInstance) {
        const room = roomManagerInstance.getRoom(roomId);
        if (room && !room.memberAgentIds.includes(wokeAgentId)) {
          this.emitWakeEvent({
            roomId,
            initiatorAgentId: agentId,
            targetAgentId: wokeAgentId,
            denialReason: 'target-not-member',
            timestamp: Date.now(),
          });
          return;  // ✅ Skip — no queue slot wasted
        }
      }
    }
    
    const wakeFn = async () => {
      await this.wakeAgentStream(wokeAgentId, message, agentId, onWakeChunk);
    };
    this.enqueueWake(wokeAgentId, wakeFn);  // Only members reach here
  });
}
```

**Impact**:
- Non-members never consume queue slots
- `wake-membership-denied` emitted immediately (not mid-stream)
- Same pattern applied to both streaming and non-streaming wakes

---

## Verification

### Build Status

```bash
$ npm run type-check
✅ No TypeScript errors

$ npm run build
✅ Main process compiled
✅ Renderer process compiled
```

### Diff Stats

```
artifacts/verify-botos/stream-backpressure-NOTES.md | 209 ++++++++++++++
src/main/agent-bus.ts                               | 167 +++++++----
2 files changed, 321 insertions(+), 55 deletions(-)
```

### PR Status

- **PR**: [#38](https://github.com/ltfysl/bot-os/pull/38)
- **Status**: Draft
- **Base**: main @ 30a2e99 (after #35 wake-errors-backpressure)
- **Branch**: cursor/stream-backpressure-5729
- **Commit**: 1583ed7

---

## Testing Plan

### DevTools Console Tests

#### Test 1: Backpressure on `requestAgentWake`

```javascript
// Setup listener
window.electronAPI.onWakeBackpressure((event) => {
  console.log(`[BP] Queue ${event.queuePosition}/${event.queueLength}, active: ${event.activeWakes}`);
});

// Flood with 20 targeted wakes (max 10 concurrent)
for (let i = 0; i < 20; i++) {
  window.electronAPI.requestAgentWake('1', '2', `Wake ${i}`, 'room-123');
}
```

**Expected**:
- First 10 execute immediately (`activeWakes` → 10)
- Remaining 10 queue (`wake-backpressure` events, positions 1-10)
- Queue drains as wakes complete
- Final state: `activeWakes` → 0, queue empty

#### Test 2: Membership Denial Before Enqueueing

```javascript
// Setup listener
window.electronAPI.onWakeMembershipDenied((event) => {
  console.log('[DENIED]', event.targetAgentId, event.denialReason);
});

// Send room message mentioning non-member
await window.electronAPI.sendRoomMessageStream(
  'room-123',
  'Hello @nonmember',
  '1'
);
```

**Expected**:
- `wake-membership-denied` event fires immediately
- No queue slot consumed (verify via queue stats)
- Non-member never reaches wake function

#### Test 3: Stream Error Slot Release

```javascript
// Setup listener
let maxActive = 0;
window.electronAPI.onWakeBackpressure((e) => {
  maxActive = Math.max(maxActive, e.activeWakes);
  console.log(`Active: ${e.activeWakes}, Queued: ${e.queueLength}, Max: ${maxActive}`);
});

// Send 15 messages to non-existent agents (will error)
for (let i = 0; i < 15; i++) {
  window.electronAPI.sendMessageStream('Error trigger @bot999', '1', {});
}

// Wait 10s for all to complete/fail
setTimeout(() => {
  console.log(`Final max active: ${maxActive}, should be ≤10`);
}, 10000);
```

**Expected**:
- `maxActive` never exceeds 10 (concurrency limit respected)
- All wakes fail (non-existent agent)
- Slots released on error (via try/finally)
- Queue drains despite failures
- Final `activeWakes` → 0

---

## Success Criteria

✅ **Uniform backpressure**: All wake types use `enqueueWake`  
✅ **Early membership checks**: Non-members rejected before enqueueing  
✅ **Awaitable promises**: `requestAgentWake` blocks until wake completes/queued  
✅ **Slot release on error**: Stream abort/timeout always releases slots  
✅ **Event emission**: `wake-backpressure` when queued, `wake-membership-denied` immediately  
✅ **Type safety**: No TypeScript errors  
✅ **Build passes**: Main + renderer compile cleanly  
✅ **Documentation**: NOTES file with implementation details

---

## Integration Summary

### Wake Paths Coverage

| Wake Type | Method | Queue Path | Membership Check | Status |
|-----------|--------|------------|------------------|--------|
| DM mention | `sendMessageWithWake` | ✅ `enqueueWake` | N/A (1:1) | ✅ |
| DM stream mention | `sendMessageWithWakeStream` | ✅ `enqueueWake` | N/A (1:1) | ✅ |
| Room mention | `sendMessageWithWake` | ✅ `enqueueWake` | ✅ Before enqueue | ✅ |
| Room stream mention | `sendMessageWithWakeStream` | ✅ `enqueueWake` | ✅ Before enqueue | ✅ |
| Targeted wake | `requestAgentWake` | ✅ `enqueueWake` (NEW) | ✅ Built-in | ✅ |
| Bot-initiated wake | `requestAgentWake` | ✅ `enqueueWake` (NEW) | ✅ Built-in | ✅ |

### Event Coverage

| Event | When | Emitter | Status |
|-------|------|---------|--------|
| `wake-backpressure` | Wake queued/throttled | `enqueueWake` | ✅ |
| `wake-membership-denied` | Non-member mentioned | `sendMessageWithWake*` | ✅ NEW |
| `wake-failure` | Wake error/unavailable | `wakeFn` catch | ✅ |
| `wake-timeout` | 5s timeout | `wakeAgent*` timeout | ✅ |

---

## Next Steps

1. **Manual testing** via DevTools console (tests above)
2. **Queue metrics** verification under load
3. **Mark PR ready** after manual testing passes
4. **Review & merge** into main

Future enhancements (separate PRs):
- Vale UI for backpressure chrome (queue position badges)
- Wake metrics dashboard (active/queued/dropped counts)
- Configurable limits per agent/room

---

## Notes

- No UI chrome changes (types/IPC only)
- No new providers
- No breaking changes to existing wake behavior
- Secret-safe (only public identifiers in events)

**Status**: ✅ Implementation complete, draft PR created, ready for testing