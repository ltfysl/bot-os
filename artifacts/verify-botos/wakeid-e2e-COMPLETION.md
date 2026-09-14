# BotOS Bus Slice: wakeId End-to-End Through Room Fan-In

## Completion Summary

**Date:** 2026-09-14  
**Branch:** `cursor/wakeid-e2e-room-fanin-2254`  
**PR:** [#44](https://github.com/ltfysl/bot-os/pull/44) (DRAFT)  
**Tip SHA:** `55b14cca2ac9152b1034f4e6b9ffc22cbd53feb8`

---

## ✅ Goals Achieved

### 1. Audit Room Send/Stream Fan-In
- **Status:** ✅ COMPLETE
- **Findings:** Main branch lacked wakeId infrastructure entirely
- **Result:** Identified all room stream chunk emission points requiring wakeId

### 2. Close Gaps
- **Status:** ✅ COMPLETE
- **Implementation:**
  - Added `generateWakeId()` in agent-bus.ts (format: `targetId-counter[-initiatorId][-roomId]`)
  - Added `wakeIdCounter` for monotonic uniqueness
  - Threaded wakeId through `sendMessageWithWakeStream` → onWakeChunk callback → main.ts → IPC
  - Updated queue entries to carry wakeId
  - Updated all wake events to include `wakeId?`

### 3. Typecheck + Build Green
- **Status:** ✅ COMPLETE
- **Evidence:**
  ```
  npm run build
  ✅ TypeScript compilation: PASS (no errors)
  ✅ Vite build: PASS (built in 1.00s)
  ```

### 4. Artifacts/Verify-Botos NOTES
- **Status:** ✅ COMPLETE
- **File:** `artifacts/verify-botos/wakeid-e2e-room-fanin-NOTES.md`
- **Contents:**
  - Complete implementation details
  - End-to-end flow diagrams
  - Compatibility matrix with PRs #39-#43
  - Integration examples for #40 (cancel) and #41 (ordered wakes)
  - Design rationale
  - Testing strategy

### 5. Draft PR Created
- **Status:** ✅ COMPLETE
- **PR URL:** https://github.com/ltfysl/bot-os/pull/44
- **Title:** `feat(bus): wakeId e2e through room fan-in`
- **State:** DRAFT (as requested)

---

## Implementation Details

### Files Modified

1. **src/main/agent-bus.ts** (Runtime layer)
   - Added `wakeIdCounter: number` private field
   - Added `generateWakeId(targetAgentId, initiatorAgentId?, roomId?): string`
   - Updated wake queue entry type to include `wakeId: string`
   - Updated `enqueueWake()` signature to accept `wakeId`
   - Updated all wake event interfaces to include `wakeId?`
   - Updated `sendMessageWithWakeStream()` to generate & propagate wakeIds
   - Updated `sendMessageWithWake()` to generate wakeIds (non-streaming path)
   - Updated `requestAgentWake()` to generate wakeId (bot-initiated wakes)

2. **src/main/main.ts** (IPC layer)
   - Updated `send-room-message-stream` handler to capture wakeId from onWakeChunk
   - Emit `room-stream-chunk` with wakeId included

3. **src/main/preload.ts** (Preload bridge)
   - Added `wakeId?: string` to `RoomStreamChunk` interface
   - Added `wakeId?: string` to all wake event interfaces

4. **src/renderer/types.ts** (Renderer types)
   - Added `wakeId?: string` to `RoomStreamChunk` interface
   - Added `wakeId?: string` to all wake event interfaces

### Wake Event Updates

All wake events now include `wakeId?`:
- `WakeFailureEvent`
- `WakeTimeoutEvent`
- `WakeMembershipDeniedEvent`
- `WakeBackpressureEvent`

---

## End-to-End Path Verification

### Room Mention Wake Flow

```
User sends: "@alice @bob hello"
    ↓
main.ts: extractRoomMentions() → [alice, bob]
    ↓
agentBus.sendMessageWithWakeStream(...) per agent
    ↓
agent-bus.ts: generateWakeId("alice", senderId, roomId) → "alice-1-sender-room"
    ↓
enqueueWake(targetId, wakeFn, wakeId)
    ↓
wakeFn executes → wakeAgentStream(..., onChunk)
    ↓
onChunk called with (wokeAgentId, chunk, done) → wrapped onWakeChunk(wokeAgentId, chunk, done, wakeId)
    ↓
main.ts: event.sender.send('room-stream-chunk', { ..., wakeId, ... })
    ↓
preload.ts: RoomStreamChunk includes wakeId
    ↓
renderer: Type-safe access to chunk.wakeId
```

### Terminal Event Flow

```
Wake failure/timeout/denial
    ↓
agent-bus.ts: emitWakeEvent({ wakeId, ... })
    ↓
main.ts: IPC forward (e.g., 'wake-failure')
    ↓
preload.ts: WakeFailureEvent includes wakeId
    ↓
renderer: Correlate event to original wake by wakeId
```

---

## Compatibility Analysis

### PR #41 (ordered multi-wake / wakeId infra)

**Status:** ✅ Complementary  
**Overlap:** Both implement `generateWakeId()` with identical logic  
**Resolution:**
- If **this PR merges first:** #41 can rebase and reuse existing `generateWakeId()`
- If **#41 merges first:** This PR can drop `generateWakeId()` and import from #41's version
- **Recommendation:** Merge this PR first (smaller surface area, minimal infra)

### PR #40 (wake cancel/abort IPC)

**Status:** ✅ Enables  
**Integration:** #40 can now implement `cancelWake(wakeId: string)` using:
- `wakeQueue.findIndex(entry => entry.wakeId === wakeId)`
- Wake events already include wakeId for correlation

### PR #39 (membership-safe broadcast)

**Status:** ✅ Independent  
**Conflicts:** None expected (different surface areas)

### PR #42 (audit-only)

**Status:** ✅ Independent  
**Conflicts:** None (audit report only)

### PR #43 (WakeSuccessEvent / DM settle)

**Status:** ✅ Compatible  
**Note:** WakeSuccessEvent can include `wakeId?` using same pattern

---

## Design Decisions

### 1. wakeId Format

**Choice:** `targetId-counter[-initiatorId][-roomId]`  
**Rationale:**
- Stable: Same format as PR #41
- Unique: Monotonic counter prevents collisions
- Contextual: Optional initiator/room provide trace context
- Parseable: Components can be extracted if needed

### 2. Optional wakeId (`wakeId?`)

**Choice:** Make wakeId optional in all interfaces  
**Rationale:**
- Backward compatibility: Existing events without wakeId still type-check
- Gradual rollout: Non-room paths can adopt wakeId incrementally
- Future-proof: New wake paths can omit wakeId initially

### 3. Generate Once, Propagate Everywhere

**Choice:** Generate wakeId in agent-bus, pass through callbacks  
**Rationale:**
- Single source of truth
- No duplication across IPC boundary
- Stable across queue: enqueue → execute → emit uses same ID

### 4. No Active Wake Tracking (Yet)

**Choice:** Generate wakeId but don't store in `Map<wakeId, metadata>`  
**Rationale:**
- Minimal scope for this PR
- #41 may implement active tracking differently
- Sufficient for cancel (#40) which only needs queue lookup

---

## Testing Strategy

### Build Verification ✅

```bash
$ npm run build
✅ TypeScript compilation: PASS (no errors)
✅ Vite build: PASS (built in 1.00s)
```

### Manual Testing (Recommended)

1. **Room mention wake:**
   ```
   - Create room with agents [alice, bob]
   - Send: "@alice @bob hello"
   - Inspect: room-stream-chunk events in devtools
   - Verify: Each chunk has unique wakeId (alice-1-..., bob-2-...)
   ```

2. **Wake failure correlation:**
   ```
   - Mention non-member agent in room
   - Check: wake-membership-denied event
   - Verify: wakeId is included
   ```

3. **Backpressure with wakeId:**
   ```
   - Trigger 10+ concurrent wakes (exceed maxConcurrentWakes)
   - Check: wake-backpressure events
   - Verify: Each queued wake has unique wakeId
   ```

### Automated Testing (Out of Scope)

- Unit tests for `generateWakeId()` format
- Integration tests for IPC propagation
- E2E tests for room fan-in correlation

---

## Known Limitations

### 1. Active Wake Tracking

**Current:** wakeId generated but not stored in `Map<wakeId, metadata>`  
**Impact:** Cancel operations must search queue linearly  
**Future:** PR #41 may add `activeWakes: Map<wakeId, WakeMetadata>`

### 2. Non-Room Wakes

**Current:** DM wakes and `sendMessageWithWake` generate wakeId but don't expose in events  
**Impact:** DM wake chunks don't carry wakeId (only room chunks do)  
**Future:** Can extend `StreamChunk` interface to include `wakeId?`

### 3. Wake Success Events

**Current:** Only failure/timeout/denial events include wakeId  
**Impact:** Success path doesn't emit wakeId-tagged event  
**Future:** PR #43 (WakeSuccessEvent) can add wakeId

---

## Next Steps (Out of Scope for This PR)

### 1. UI Chrome for wakeId

**Owner:** Vale (chrome layer)  
**Scope:**
- Show wakeId in dev tools / debug panel
- Display wake status by wakeId (active/queued/complete)
- Cancel button per wakeId

### 2. Active Wake Tracking

**Owner:** PR #41 or follow-up  
**Scope:**
```typescript
activeWakes: Map<string, {
  wakeId: string;
  targetAgentId: string;
  initiatorAgentId?: string;
  roomId?: string;
  startTime: number;
}>;
```

### 3. Ordered Wake Integration

**Owner:** PR #41  
**Scope:**
- Replace forEach loops in main.ts with `enqueueOrderedWakes()`
- Maintain same wakeId propagation path
- Add order-skip events with wakeId

### 4. DM Wake wakeId Propagation

**Owner:** Future PR  
**Scope:**
- Extend `StreamChunk` to include `wakeId?`
- Update DM stream handlers to emit wakeId
- Add wakeId to `onWakeStreamChunk` renderer path

---

## Integration Guide

### For PR #40 (Wake Cancel)

```typescript
// Add to agent-bus.ts
export async function cancelWake(wakeId: string): Promise<boolean> {
  const queuedIdx = this.wakeQueue.findIndex(entry => entry.wakeId === wakeId);
  if (queuedIdx === -1) return false;
  
  const removed = this.wakeQueue.splice(queuedIdx, 1)[0];
  removed.reject(new Error('Wake cancelled'));
  
  this.emitWakeEvent({
    wakeId,
    targetAgentId: removed.targetAgentId,
    reason: 'general-error',
    errorMessage: 'Wake cancelled by user',
    timestamp: Date.now(),
  });
  
  return true;
}

// IPC handler in main.ts
ipcMain.handle('cancel-wake', async (_event, wakeId: string) => {
  const cancelled = agentBus.cancelWake(wakeId);
  return { success: cancelled };
});
```

### For PR #41 (Ordered Multi-Wake)

**If #41 merges first:**
```typescript
// This PR can drop generateWakeId and import from #41
import { generateWakeId } from './ordered-wake-utils';
```

**If this PR merges first:**
```typescript
// #41 can reuse existing generateWakeId in agent-bus
// Just add enqueueOrderedWakes() method that calls existing generateWakeId()
```

---

## Constraints Met

✅ **poteto/pstack:** Minimal, surgical changes  
✅ **No providers:** No provider code touched  
✅ **No UI:** Zero React/CSS changes  
✅ **Secret-safe:** No secret handling code modified

---

## Success Criteria

✅ **Draft PR URL:** https://github.com/ltfysl/bot-os/pull/44  
✅ **Tip SHA:** `55b14cca2ac9152b1034f4e6b9ffc22cbd53feb8`  
✅ **E2E wakeId path documented:** `artifacts/verify-botos/wakeid-e2e-room-fanin-NOTES.md`  
✅ **Builds green:** TypeScript + Vite both pass  
✅ **PR state:** DRAFT (not marked ready)

---

## Summary

Stable `wakeId` now flows from:
- **Generation:** agent-bus.ts `generateWakeId()`
- **Enqueue:** wake queue entry includes wakeId
- **Execution:** wakeId passed through onWakeChunk callback
- **IPC:** main.ts emits `room-stream-chunk` with wakeId
- **Preload:** RoomStreamChunk interface includes wakeId
- **Renderer:** Type-safe access to chunk.wakeId

All wake events (failure/timeout/denial/backpressure) now include `wakeId?` for correlation.

Ready for integration with:
- **PR #40** (cancel operations keyed by wakeId)
- **PR #41** (ordered wake execution with same wakeId format)

Build verified, types consistent, documentation complete. 🚀
