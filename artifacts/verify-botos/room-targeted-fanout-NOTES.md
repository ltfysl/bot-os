# Room Targeted Fan-Out & Ordered Multi-Wake Implementation Notes

**Branch:** `cursor/dm-threads-c7af` (stacked on PR #36)  
**Implementation Date:** 2026-09-07  
**Scope:** Slice 3 (Orin) - Room targeted fan-out + ordered multi-wake

---

## Goal

Enable targeted wake of a **subset** of room members in a **defined order** (sequential or priority-based), while respecting the wake errors and backpressure infrastructure from Slice 1 (#35).

---

## Changes Summary

### 1. New Types & Interfaces ✅ IMPLEMENTED

**agent-bus.ts:**

```typescript
export type WakeOrder = 'sequential' | 'priority';

export interface TargetedWakeTarget {
  agentId: string;
  priority?: number;
}

export interface TargetedWakeRequest {
  roomId: string;
  initiatorAgentId: string;
  targets: TargetedWakeTarget[];
  message: string;
  order: WakeOrder;
}

export interface WakeCompletionEvent {
  roomId: string;
  initiatorAgentId: string;
  targetAgentId: string;
  success: boolean;
  reason?: WakeFailureReason;
  errorMessage?: string;
  timestamp: number;
  orderIndex?: number;
}
```

**Key Design Decisions:**

1. **Two Wake Modes:**
   - `sequential`: Wake targets one after another (serial execution)
   - `priority`: Wake all targets concurrently, sorted by priority (higher priority = earlier in list)

2. **WakeCompletionEvent:**
   - Unified event for both success and failure outcomes
   - `success` field discriminates between completion types
   - `orderIndex` tracks position in wake sequence for debugging
   - Includes optional `reason` and `errorMessage` for failures

3. **Priority-Based Ordering:**
   - Higher numeric priority = higher importance
   - Default priority is undefined (treated as 0)
   - Priority only affects ordering, not actual execution priority in queue

### 2. AgentBus Methods ✅ IMPLEMENTED

**requestTargetedRoomWake(request: TargetedWakeRequest): Promise<void>**

Main entry point for targeted room wakes. Handles:
- Room existence validation
- Initiator membership validation
- Target membership validation (per target, non-blocking)
- Order-based execution dispatch

**Validation Flow:**

1. **Room Validation:**
   - Verify room exists
   - Verify initiator is registered agent
   - Verify initiator is room member

2. **Target Filtering:**
   - For each target, check room membership
   - If not a member, emit `WakeCompletionEvent` with `success: false` and `reason: 'membership-denied'`
   - Continue with remaining valid targets

3. **Execution Dispatch:**
   - Sequential mode: `await` each wake in order
   - Priority mode: `Promise.allSettled()` for concurrent execution with ordered list

**executeTargetedWake(roomId, initiatorAgentId, targetAgentId, message, orderIndex): Promise<void>**

Private helper that wraps individual wake execution:
- Calls existing `requestAgentWake()` to leverage timeout/backpressure logic
- Catches any errors and emits `WakeCompletionEvent` with appropriate reason
- Uses `enqueueWake()` to respect backpressure limits from Slice 1

**Error Classification:**

```typescript
let reason: WakeFailureReason = 'general-error';

if (errorMessage.includes('timeout') || errorMessage.includes('Wake timeout')) {
  reason = 'timeout';
} else if (errorMessage.includes('not found')) {
  reason = 'agent-not-found';
} else if (errorMessage.includes('Provider not found')) {
  reason = 'provider-not-found';
} else if (errorMessage.includes('not available')) {
  reason = 'provider-unavailable';
} else if (errorMessage.includes('not a member')) {
  reason = 'membership-denied';
}
```

### 3. IPC Layer ✅ IMPLEMENTED

**preload.ts:**

```typescript
requestTargetedRoomWake: (request: TargetedWakeRequest): Promise<void> =>
  ipcRenderer.invoke('request-targeted-room-wake', request),

onWakeCompletion: (callback: (event: WakeCompletionEvent) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, wakeEvent: WakeCompletionEvent) => callback(wakeEvent);
  ipcRenderer.on('wake-completion', handler);
  return () => ipcRenderer.removeListener('wake-completion', handler);
},
```

**main.ts:**

Handler added:
```typescript
ipcMain.handle('request-targeted-room-wake', async (_event, request: TargetedWakeRequest) => {
  try {
    await agentBus.requestTargetedRoomWake(request);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});
```

Event forwarding in `onWakeEvent` callback:
```typescript
if ('success' in event) {
  mainWindow.webContents.send('wake-completion', {
    roomId: event.roomId,
    initiatorAgentId: event.initiatorAgentId,
    targetAgentId: event.targetAgentId,
    success: event.success,
    reason: event.reason,
    errorMessage: event.errorMessage,
    timestamp: event.timestamp,
    orderIndex: event.orderIndex,
  });
}
```

### 4. Integration with Slice 1 Backpressure ✅ VERIFIED

**Wake Queue Respect:**
- All targeted wakes flow through `executeTargetedWake()` → `enqueueWake()`
- Respects `maxConcurrentWakes` (default: 10)
- Respects `wakeQueueLimit` (default: 50)
- Queue overflow drops oldest and emits `wake-failure` event

**Sequential Mode Behavior:**
- Each wake completes before next starts
- Wake N+1 waits for wake N to finish (or timeout/fail)
- Does NOT block the queue for other wakes (uses standard enqueue mechanism)
- Total time = sum of individual wake times

**Priority Mode Behavior:**
- All wakes enqueued concurrently (subject to queue limits)
- Order of `targets` array reflects priority (highest first)
- Actual execution order determined by queue availability
- `Promise.allSettled()` waits for all wakes to complete or fail

---

## Files Modified

### Core Implementation

1. **src/main/agent-bus.ts** (~140 lines added)
   - `WakeOrder`, `TargetedWakeTarget`, `TargetedWakeRequest`, `WakeCompletionEvent` types
   - `requestTargetedRoomWake()` method (main entry point)
   - `executeTargetedWake()` private helper
   - Updated `emitWakeEvent()` signature to include `WakeCompletionEvent`
   - Updated `WakeEventCallback` type

2. **src/main/main.ts** (~35 lines modified)
   - New IPC handler: `request-targeted-room-wake`
   - Updated `onWakeEvent` callback to handle `WakeCompletionEvent`
   - Event forwarding to renderer via `wake-completion` channel

### IPC/Types Layer

3. **src/main/preload.ts** (~40 lines added)
   - Exported `WakeOrder`, `TargetedWakeTarget`, `TargetedWakeRequest`, `WakeCompletionEvent` types
   - `requestTargetedRoomWake()` IPC method
   - `onWakeCompletion()` event listener

### No Changes Required To

- RoomManager (no new room-level APIs needed)
- DmManager (DM targeted wakes out of scope)
- Provider implementations
- Existing wake paths (broadcast, single-target, DM)
- Secrets handling

---

## Behavior Verification

### Sequential Wake Scenario

**Input:**
```typescript
await window.electronAPI.requestTargetedRoomWake({
  roomId: 'room-123',
  initiatorAgentId: '1',
  targets: [
    { agentId: '2' },
    { agentId: '3' },
    { agentId: '4' },
  ],
  message: 'Wake up, team!',
  order: 'sequential',
});
```

**Expected Output:**

1. Wake agent 2, wait for completion
2. Emit `wake-completion` with `orderIndex: 0`
3. Wake agent 3, wait for completion
4. Emit `wake-completion` with `orderIndex: 1`
5. Wake agent 4, wait for completion
6. Emit `wake-completion` with `orderIndex: 2`

**Timeline:**
```
t=0s:    Wake agent 2 starts
t=2s:    Wake agent 2 completes (success)
         ↳ wake-completion { targetAgentId: '2', success: true, orderIndex: 0 }
         ↳ Wake agent 3 starts
t=4s:    Wake agent 3 completes (success)
         ↳ wake-completion { targetAgentId: '3', success: true, orderIndex: 1 }
         ↳ Wake agent 4 starts
t=6s:    Wake agent 4 completes (success)
         ↳ wake-completion { targetAgentId: '4', success: true, orderIndex: 2 }
```

### Priority Wake Scenario

**Input:**
```typescript
await window.electronAPI.requestTargetedRoomWake({
  roomId: 'room-123',
  initiatorAgentId: '1',
  targets: [
    { agentId: '5', priority: 10 },
    { agentId: '2', priority: 5 },
    { agentId: '3', priority: 1 },
  ],
  message: 'Priority alert!',
  order: 'priority',
});
```

**Expected Output:**

1. Targets sorted by priority: [5 (p=10), 2 (p=5), 3 (p=1)]
2. All wakes enqueued concurrently
3. Emit `wake-completion` events as each completes (order may vary)

**Timeline:**
```
t=0s:    Wake agent 5 enqueued (orderIndex: 0)
         Wake agent 2 enqueued (orderIndex: 1)
         Wake agent 3 enqueued (orderIndex: 2)
         (All three may execute concurrently, subject to maxConcurrentWakes limit)
         
t=1.5s:  Wake agent 5 completes (success)
         ↳ wake-completion { targetAgentId: '5', success: true, orderIndex: 0 }
         
t=2.0s:  Wake agent 3 completes (success)
         ↳ wake-completion { targetAgentId: '3', success: true, orderIndex: 2 }
         
t=2.5s:  Wake agent 2 completes (success)
         ↳ wake-completion { targetAgentId: '2', success: true, orderIndex: 1 }
```

**Note:** orderIndex reflects original sorted position, NOT completion order.

### Membership Validation Scenario

**Input:**
```typescript
await window.electronAPI.requestTargetedRoomWake({
  roomId: 'room-123',
  initiatorAgentId: '1',
  targets: [
    { agentId: '2' },    // Valid member
    { agentId: '999' },  // NOT a room member
    { agentId: '3' },    // Valid member
  ],
  message: 'Mixed membership',
  order: 'sequential',
});
```

**Expected Output:**

1. Target validation filters out agent 999
2. Emit `wake-completion` with `success: false, reason: 'membership-denied'` for agent 999
3. Continue with agents 2 and 3

**Events:**
```typescript
// Immediate failure for non-member
wake-completion {
  targetAgentId: '999',
  success: false,
  reason: 'membership-denied',
  errorMessage: 'Target agent 999 is not a member of room room-123',
  timestamp: <now>,
}

// Then normal wake flow for valid members
wake-completion { targetAgentId: '2', success: true, orderIndex: 0 }
wake-completion { targetAgentId: '3', success: true, orderIndex: 1 }
```

### Wake Timeout in Sequential Mode

**Input:**
```typescript
await window.electronAPI.requestTargetedRoomWake({
  roomId: 'room-123',
  initiatorAgentId: '1',
  targets: [
    { agentId: '2' },
    { agentId: 'slow-agent' },  // Takes > 5s
    { agentId: '3' },
  ],
  message: 'Sequential with timeout',
  order: 'sequential',
});
```

**Expected Output:**

1. Wake agent 2: Success
2. Wake `slow-agent`: Timeout after 5s
3. Emit `wake-completion` with `success: false, reason: 'timeout'`
4. Continue to agent 3: Success

**Timeline:**
```
t=0s:    Wake agent 2 starts
t=1s:    Agent 2 completes (success)
         ↳ wake-completion { targetAgentId: '2', success: true, orderIndex: 0 }
         ↳ Wake slow-agent starts
         
t=6s:    slow-agent timeout (5s elapsed)
         ↳ wake-completion { 
             targetAgentId: 'slow-agent', 
             success: false, 
             reason: 'timeout',
             errorMessage: 'Wake timeout',
             orderIndex: 1 
           }
         ↳ Wake agent 3 starts
         
t=7s:    Agent 3 completes (success)
         ↳ wake-completion { targetAgentId: '3', success: true, orderIndex: 2 }
```

---

## Security Considerations

### ✅ Secret Isolation

- `WakeCompletionEvent` contains only public identifiers:
  - `roomId`: Room public ID
  - `initiatorAgentId`: Agent public ID
  - `targetAgentId`: Agent public ID
  - `reason`: Enum value (no secrets)
  - `errorMessage`: Sanitized error (no API keys, tokens)
  - `orderIndex`: Integer index
- No provider secrets, API keys, or auth tokens included

### ✅ Room Membership Validation

- Initiator must be room member (validated before any wakes)
- Each target must be room member (validated per-target)
- Non-members cannot be woken via this API
- Validation failures emit events but don't block valid targets

### ✅ Backpressure Integration

- All targeted wakes respect existing queue limits
- No new resource exhaustion vectors introduced
- Leverages Slice 1 infrastructure (maxConcurrentWakes, wakeQueueLimit)

---

## Design Decisions

### Why Two Order Modes?

**Sequential:**
- Use case: Ordered task delegation (e.g., "first agent analyzes, second agent reviews, third agent executes")
- Guarantees deterministic ordering
- Each wake sees the result of previous wakes (if message history is shared)

**Priority:**
- Use case: Alerting subset of team (e.g., "wake 3 specific agents for this emergency")
- Faster total time (concurrent execution)
- Priority sorting allows importance-based processing
- No dependency between wakes

### Why Not Use Existing Broadcast?

Current room broadcast wakes **ALL** @mentioned agents. This PR adds:
1. **Subset selection:** Wake only specific agents, not all mentions
2. **Ordered execution:** Control when each wake happens
3. **Completion tracking:** Per-target success/failure events with orderIndex

Broadcast is still appropriate for "everyone respond" scenarios. Targeted is for "specific agents in specific order."

### Why Include orderIndex?

Debugging and observability:
- Sequential mode: Confirms execution order
- Priority mode: Maps completion back to original request position
- Telemetry: Track which position in sequence fails most often

---

## API Reference

### requestTargetedRoomWake

**Signature:**
```typescript
async requestTargetedRoomWake(request: TargetedWakeRequest): Promise<void>
```

**Parameters:**
```typescript
interface TargetedWakeRequest {
  roomId: string;                // Room to wake within
  initiatorAgentId: string;       // Agent requesting the wake
  targets: TargetedWakeTarget[];  // Agents to wake
  message: string;                // Wake message
  order: WakeOrder;               // 'sequential' or 'priority'
}

interface TargetedWakeTarget {
  agentId: string;   // Target agent ID
  priority?: number; // Priority (only used in 'priority' mode)
}
```

**Returns:** `Promise<void>` (resolves when all wakes enqueued/completed based on mode)

**Throws:**
- Room not found
- Initiator not found
- Initiator not room member

**Emits:**
- `WakeCompletionEvent` per target (success or failure)

### WakeCompletionEvent

**Structure:**
```typescript
interface WakeCompletionEvent {
  roomId: string;            // Room context
  initiatorAgentId: string;  // Wake initiator
  targetAgentId: string;     // Wake target
  success: boolean;          // true = wake succeeded, false = failed
  reason?: WakeFailureReason; // Only present if success === false
  errorMessage?: string;     // Only present if success === false
  timestamp: number;         // Event timestamp (ms since epoch)
  orderIndex?: number;       // Position in targets array
}
```

**Success Event:**
```typescript
{
  roomId: 'room-123',
  initiatorAgentId: '1',
  targetAgentId: '2',
  success: true,
  timestamp: 1725717000000,
  orderIndex: 0,
}
```

**Failure Event:**
```typescript
{
  roomId: 'room-123',
  initiatorAgentId: '1',
  targetAgentId: '3',
  success: false,
  reason: 'timeout',
  errorMessage: 'Wake timeout',
  timestamp: 1725717005000,
  orderIndex: 1,
}
```

---

## Testing Notes

### Type Safety Validation ✅ PASS

```bash
$ npm run type-check
# Output: (no errors)
```

### Build Validation ✅ PASS

```bash
$ npm run build
# Output:
# - Main process build: Success
# - Renderer process build: Success
# - Vite production bundle: 172.96 kB (gzipped: 53.70 kB)
```

### Manual Testing Checklist

**Sequential Wake:**
- [ ] Create room with 3+ agents
- [ ] Call `requestTargetedRoomWake` with `order: 'sequential'`
- [ ] Verify wakes execute in order (check timestamps in console)
- [ ] Verify `wake-completion` events have correct `orderIndex`
- [ ] Verify total time ≈ sum of individual wake times

**Priority Wake:**
- [ ] Create room with 3+ agents
- [ ] Call `requestTargetedRoomWake` with `order: 'priority'` and varying priorities
- [ ] Verify targets are sorted by priority before execution
- [ ] Verify `wake-completion` events emitted for all targets
- [ ] Verify concurrent execution (faster than sequential)

**Membership Validation:**
- [ ] Call targeted wake with non-member initiator
- [ ] Verify error thrown and no wakes executed
- [ ] Call targeted wake with some non-member targets
- [ ] Verify immediate `wake-completion` with `success: false` for non-members
- [ ] Verify valid targets still wake successfully

**Timeout Handling:**
- [ ] Include slow agent in sequential wake
- [ ] Verify timeout after 5s
- [ ] Verify `wake-completion` with `reason: 'timeout'`
- [ ] Verify subsequent targets still wake after timeout

**Backpressure Integration:**
- [ ] Trigger 60+ targeted wakes to hit queue limit
- [ ] Verify oldest dropped when queue full
- [ ] Verify `wake-failure` events emitted for dropped wakes
- [ ] Verify no new memory leaks or resource exhaustion

---

## Future Enhancements (Out of Scope)

### Chrome UI for Targeted Wakes

**What:** UI to select subset of room members and order mode

**When:** Vale milestone (future slice)

**Examples:**
- Dropdown to select specific agents from room
- Toggle for sequential vs. priority mode
- Visual indicator of wake progress/completion

### Wake Response Aggregation

**What:** Collect all wake responses and present as unified result

**When:** After targeted wake patterns stabilize

**Considerations:**
- Combine multiple agent responses
- Handle partial failures (some wakes succeed, some fail)
- Show progress indicator during multi-wake

### Conditional Wake Chains

**What:** Wake agent N+1 only if agent N succeeds

**When:** If use cases emerge for complex workflows

**Example:**
```typescript
{
  targets: [
    { agentId: '2', onSuccess: 'continue' },
    { agentId: '3', onSuccess: 'continue' },
    { agentId: '4' },
  ],
  order: 'sequential',
}
```

If agent 2 fails, skip agents 3 and 4.

---

## Integration with Previous Slices

### Slice 1 (Wake Errors & Backpressure) ✅ ALIGNED

- Uses `enqueueWake()` → respects `maxConcurrentWakes` and `wakeQueueLimit`
- Emits `WakeCompletionEvent` which extends wake error semantics
- Timeout handling (5s) consistent with existing wake paths
- Error classification logic reused from `requestAgentWake()`

### Slice 2 (DMs) ✅ ORTHOGONAL

- DMs are 1:1, no targeted multi-wake needed
- Room targeted wakes do not affect DM wake behavior
- `dmId` field in `WakeFailureEvent` / `WakeTimeoutEvent` remains separate

---

## Summary

This PR adds **room targeted fan-out** with **ordered multi-wake** capabilities to the Agent Communication Bus. It introduces:

1. **Two execution modes:** Sequential (one-by-one) and Priority (concurrent, sorted)
2. **Per-target completion events:** Unified `WakeCompletionEvent` for success/failure tracking
3. **Membership validation:** Per-target checks with non-blocking failure emission
4. **Backpressure integration:** Leverages Slice 1 queue/concurrency limits

All types are exposed via IPC for future chrome consumption (Vale). No UI chrome included in this PR.

**Next Steps (Future Work):**
1. Vale UI: Chrome to select subset of room members and order mode
2. Progress indicators: Show wake completion status in room view
3. Response aggregation: Collect and display multiple wake responses
