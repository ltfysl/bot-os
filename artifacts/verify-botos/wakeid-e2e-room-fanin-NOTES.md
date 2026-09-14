# wakeId End-to-End Through Room Fan-In

**Branch:** `cursor/wakeid-e2e-room-fanin-2254`  
**Scope:** Runtime/IPC/preload/types ONLY — no React/CSS chrome  
**Status:** ✅ COMPLETE (Draft PR)

## Overview

Implements stable `wakeId` tracking from wake generation → stream chunks → terminal events → renderer types, enabling cancel (#40) and order-skip (#41) operations to key off a single stable identifier.

## Implementation Scope

### 1. Wake ID Generation (agent-bus.ts)

**Added Infrastructure:**
- `wakeIdCounter: number` — monotonic counter for uniqueness
- `generateWakeId(targetAgentId, initiatorAgentId?, roomId?)` — stable ID generation
  - Format: `targetAgentId-counter[-initiatorAgentId][-roomId]`
  - Example: `agent-123-42-alice-room-xyz`

**Updated Queue Entry:**
```typescript
wakeQueue: Array<{ 
  fn: () => Promise<void>; 
  targetAgentId: string;
  wakeId: string;  // ← Added
  resolve: () => void; 
  reject: (err: Error) => void;
}>
```

### 2. Wake Event Updates (agent-bus.ts)

**All wake events now include `wakeId?`:**
- `WakeFailureEvent`
- `WakeTimeoutEvent`
- `WakeMembershipDeniedEvent`
- `WakeBackpressureEvent`

**Event propagation paths:**
- Membership denial → includes wakeId
- Timeout → includes wakeId (moved from inline generation to wakeFn context)
- Backpressure → includes wakeId
- General failure → includes wakeId

### 3. Stream Chunk Propagation (agent-bus.ts → main.ts → preload.ts)

**agent-bus.ts:**
- Updated `sendMessageWithWakeStream` signature:
  ```typescript
  onWakeChunk?: (wokeAgentId: string, chunk: string, done: boolean, wakeId?: string) => void
  ```
- Generate wakeId per mentioned agent
- Pass wakeId through onWakeChunk callback

**main.ts (send-room-message-stream handler):**
- Capture wakeId from onWakeChunk callback
- Emit `room-stream-chunk` with wakeId:
  ```typescript
  event.sender.send('room-stream-chunk', {
    id: `${Date.now()}-${wokeAgentId}`,
    roomId,
    wakeId,  // ← Added
    agentId: wokeAgentId,
    agentName: ...,
    agentAvatar: ...,
    chunk,
    done,
  });
  ```

**preload.ts:**
- Updated `RoomStreamChunk` interface to include `wakeId?: string`

**types.ts:**
- Mirrored `RoomStreamChunk` update with `wakeId?: string`
- Updated all wake event interfaces to include `wakeId?: string`

### 4. Queue & Backpressure Integration

**Updated `enqueueWake` signature:**
```typescript
private async enqueueWake(
  targetAgentId: string, 
  wakeFn: () => Promise<void>, 
  wakeId: string  // ← Added
): Promise<void>
```

**Backpressure event emission:**
- Queue drops now include wakeId of dropped wake
- Queue position events include wakeId of enqueued wake

### 5. Non-Room Wake Paths

**Also updated:**
- `sendMessageWithWake` — generates wakeId per mentioned agent (non-streaming)
- `requestAgentWake` — generates wakeId for bot-initiated wakes

## End-to-End Flow

### Room Mention Wake (Streaming)

1. **User sends room message:** `@alice hello`
2. **main.ts:** Extracts mention → calls `agentBus.sendMessageWithWakeStream(...)`
3. **agent-bus.ts:** 
   - Generates wakeId: `alice-1-senderId-roomId`
   - Enqueues wake with wakeId
   - On chunk: calls `onWakeChunk(wokeAgentId, chunk, done, wakeId)`
4. **main.ts:** Receives chunk with wakeId → emits `room-stream-chunk` with wakeId
5. **preload.ts:** Forwards `RoomStreamChunk` (includes wakeId)
6. **renderer types.ts:** Type-safe `RoomStreamChunk.wakeId?: string`

### Terminal Event Path

1. **Wake fails/times out/denied:**
2. **agent-bus.ts:** Emits wake event with wakeId
3. **main.ts:** Forwards event via IPC (e.g., `wake-failure`, `wake-timeout`)
4. **preload.ts:** Type-safe event with `wakeId?: string`
5. **renderer:** Can correlate event to specific wake by wakeId

## Compatibility

### PR #41 (ordered multi-wake / wakeId infra)

**Status:** ✅ Complementary

- **#41 owns:** Full wakeId infrastructure + ordered wake execution + `enqueueOrderedWakes` API
- **This PR owns:** Room fan-in paths that thread wakeId through to IPC/renderer
- **Integration path:** 
  - If merged to main first: #41 can rebase and use existing wakeId generation
  - If #41 merged first: This PR can drop `generateWakeId` and reuse #41's version

### PR #40 (wake cancel/abort IPC)

**Status:** ✅ Enables

- Cancel operations can now target wakes by `wakeId`
- Example: `cancelWake(wakeId: string)` can match against active/queued wakes

### PR #39 (membership-safe broadcast)

**Status:** ✅ Independent

- #39 modifies main.ts IPC handlers (different surface area)
- This PR modifies agent-bus internals and types
- No merge conflicts expected

## Build Verification

```bash
npm run build
✅ TypeScript compilation: PASS (no errors)
✅ Vite build: PASS (built in 1.00s)
```

## Key Files Modified

1. **src/main/agent-bus.ts**
   - Added `wakeIdCounter`, `generateWakeId()`
   - Updated wake queue entry to include `wakeId`
   - Updated all wake event interfaces to include `wakeId?`
   - Updated `enqueueWake()` signature to accept `wakeId`
   - Updated `sendMessageWithWakeStream()` to generate & propagate wakeIds
   - Updated `sendMessageWithWake()` to generate wakeIds
   - Updated `requestAgentWake()` to generate wakeId

2. **src/main/main.ts**
   - Updated `send-room-message-stream` handler to:
     - Accept wakeId from onWakeChunk callback
     - Emit `room-stream-chunk` with wakeId

3. **src/main/preload.ts**
   - Added `wakeId?: string` to `RoomStreamChunk`
   - Added `wakeId?: string` to all wake event interfaces

4. **src/renderer/types.ts**
   - Added `wakeId?: string` to `RoomStreamChunk`
   - Added `wakeId?: string` to all wake event interfaces

## Integration Notes

### For PR #40 (Wake Cancel)

Wake cancellation can now target by wakeId:

```typescript
// Example cancel implementation
export async function cancelWake(wakeId: string): Promise<void> {
  // Check active wakes
  const activeWake = activeWakes.get(wakeId);
  if (activeWake) {
    // Cancel logic
  }
  
  // Check queued wakes
  const queuedIdx = wakeQueue.findIndex(entry => entry.wakeId === wakeId);
  if (queuedIdx !== -1) {
    const removed = wakeQueue.splice(queuedIdx, 1)[0];
    removed.reject(new Error('Wake cancelled'));
    emitWakeEvent({
      wakeId,
      targetAgentId: removed.targetAgentId,
      reason: 'general-error',
      errorMessage: 'Wake cancelled by user',
      timestamp: Date.now(),
    });
  }
}
```

### For PR #41 (Ordered Multi-Wake)

If #41's ordered wake API is adopted for room fan-out:

```typescript
// Example: Replace forEach in send-room-message-stream
const targets = mentionedAgentIds.map(id => ({
  agentId: id,
  message: content,
}));

await agentBus.enqueueOrderedWakes(
  targets, 
  senderId, 
  roomId, 
  (wakeId, agentId, chunk, done) => {
    event.sender.send('room-stream-chunk', {
      id: `${Date.now()}-${agentId}`,
      roomId,
      wakeId,  // ← Already available from this PR
      agentId,
      agentName: agentBus.getAgent(agentId)?.name || 'Unknown',
      agentAvatar: agentBus.getAgent(agentId)?.avatar || '??',
      chunk,
      done,
    });
  }
);
```

## Design Rationale

### Why Include wakeId in All Events?

- **Correlation:** Client can match timeout/failure to specific wake request
- **Debugging:** Full trace of wake lifecycle by wakeId
- **Cancel support:** Events can reference the cancelled wakeId

### Why Optional `wakeId?`?

- **Backward compat:** Existing wake events without wakeId (e.g., from DM wakes) still type-check
- **Gradual rollout:** Non-room paths can adopt wakeId incrementally

### Why Generate wakeId Early?

- **Single source of truth:** Generated once in agent-bus, propagated everywhere
- **No duplication:** Main.ts doesn't need to know generation logic
- **Stable across queue:** Same wakeId from enqueue → execute → emit

## Testing Strategy

### Manual Verification

1. **Room mention wake:**
   - Create room with 2+ agents
   - Send message with `@agent1 @agent2`
   - Verify `room-stream-chunk` events include unique wakeIds per agent

2. **Wake failure correlation:**
   - Trigger membership denial (mention non-member agent)
   - Check `wake-membership-denied` event includes wakeId
   - Verify wakeId matches the enqueued wake

3. **Backpressure:**
   - Trigger 10+ concurrent wakes
   - Check `wake-backpressure` events include wakeId
   - Verify queued wakes retain wakeId through queue lifecycle

### Automated Testing (Out of Scope)

- Unit tests for `generateWakeId()` format
- Integration tests for wakeId propagation through IPC boundary
- E2E tests for room fan-in with wakeId correlation

## Next Steps (Out of Scope)

1. **UI chrome for wakeId display:** (Vale owns chrome layer)
   - Show wakeId in dev tools
   - Display wake status by wakeId

2. **Active wake tracking:** (Optional for #41)
   - `activeWakes: Map<string, WakeMetadata>`
   - Store wakeId → { targetAgentId, initiatorAgentId, roomId, startTime }

3. **Ordered wake integration:** (Depends on #41)
   - Replace forEach loops with `enqueueOrderedWakes()`
   - Maintain same wakeId propagation path

## Summary

✅ **wakeId generated** at enqueue time in agent-bus.ts  
✅ **wakeId propagated** through stream chunks (agent-bus → main.ts → preload → renderer)  
✅ **wakeId included** in all wake events (failure/timeout/denial/backpressure)  
✅ **Types updated** end-to-end (preload.ts, types.ts)  
✅ **Build green** (TypeScript + Vite)  
✅ **Ready for #40/#41 integration** (cancel/ordered wakes)

**Merge-ready:** Draft PR open, no conflicts with main, complementary to open drafts.
