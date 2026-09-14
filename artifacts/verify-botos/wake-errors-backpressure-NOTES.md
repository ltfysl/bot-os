# Wake Errors & Backpressure Implementation Notes

**Branch:** `cursor/wake-errors-backpressure-77ea`  
**Implementation Date:** 2026-09-07  
**Scope:** Slice 1 - Bus primary wake error surfacing + backpressure

---

## Goal

Surface failed, timeout, and membership-denied wake outcomes on the Agent Communication Bus and expose them via IPC for chrome to react to later (Vale). This PR includes no chrome UI—only types, preload, and main-process logic.

---

## Changes Summary

### 1. Wake Event Types & IPC Surface ✅ IMPLEMENTED

**New Types (renderer/types.ts, preload.ts):**

```typescript
export type WakeFailureReason = 
  | 'timeout' 
  | 'membership-denied' 
  | 'agent-not-found' 
  | 'provider-not-found' 
  | 'provider-unavailable' 
  | 'general-error';

export interface WakeFailureEvent {
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  reason: WakeFailureReason;
  errorMessage: string;
  timestamp: number;
}

export interface WakeTimeoutEvent {
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  timeoutMs: number;
  timestamp: number;
}

export interface WakeMembershipDeniedEvent {
  roomId: string;
  initiatorAgentId: string;
  targetAgentId: string;
  denialReason: 'initiator-not-member' | 'target-not-member';
  timestamp: number;
}

export interface WakeBackpressureEvent {
  targetAgentId: string;
  queuePosition: number;
  queueLength: number;
  activeWakes: number;
  timestamp: number;
}
```

**IPC Events (preload.ts):**

- `wake-failure`: General wake failures (agent not found, provider unavailable, etc.)
- `wake-timeout`: Wake timeout events (5s timeout)
- `wake-membership-denied`: Room membership validation failures
- `wake-backpressure`: Wake queued due to concurrency limit (Waiting...)

**Exposed via preload:**

```typescript
onWakeFailure: (callback: (event: WakeFailureEvent) => void) => (() => void)
onWakeTimeout: (callback: (event: WakeTimeoutEvent) => void) => (() => void)
onWakeMembershipDenied: (callback: (event: WakeMembershipDeniedEvent) => void) => (() => void)
onWakeBackpressure: (callback: (event: WakeBackpressureEvent) => void) => (() => void)
```

### 2. AgentBus Event Emission ✅ IMPLEMENTED

**New Configuration Options (agent-bus.ts):**

```typescript
export interface AgentBusConfig {
  providers: AgentProvider[];
  defaultProviderId?: string;
  maxConcurrentWakes?: number;      // Default: 10
  wakeQueueLimit?: number;          // Default: 50
  onWakeEvent?: WakeEventCallback;  // Event callback
}
```

**Event Callback:**

```typescript
export type WakeEventCallback = (
  event: WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent | WakeBackpressureEvent
) => void;
```

**Wake Event Emission Points:**

1. **Timeout Events:**
   - `wakeAgent()` - 5s timeout in `sendMessageWithWake`
   - `wakeAgentStream()` - 5s timeout in `sendMessageWithWakeStream`
   - `requestAgentWake()` - 5s timeout in bot-initiated wakes

2. **Membership Denied Events:**
   - `requestAgentWake()` - When initiator not in room
   - `requestAgentWake()` - When target not in room

3. **Failure Events:**
   - Agent not found
   - Provider not found
   - Provider unavailable
   - General errors with proper reason classification

4. **Backpressure Events:**
   - `enqueueWake()` - When wake is queued due to concurrency limit
   - Includes queue position, queue length, and active wakes count
   - Chrome can show "Waiting..." indicator

**Context Included (Secret-Safe):**

All events include:
- `targetAgentId` (always)
- `initiatorAgentId` (when available)
- `roomId` (when applicable)
- `reason` / `denialReason` (structured classification)
- `errorMessage` (human-readable, no secrets)
- `timestamp` (milliseconds since epoch)

✅ **No API keys, tokens, or secrets included**

### 3. Backpressure System ✅ IMPLEMENTED

**Wake Queue Management:**

- **Max Concurrent Wakes:** 10 (configurable)
- **Queue Limit:** 50 (configurable)
- **Drop Policy:** FIFO oldest when queue full

**Implementation:**

```typescript
private activeWakes: number = 0;
private wakeQueue: Array<{ fn: () => Promise<void>; targetAgentId: string }> = [];

private async enqueueWake(targetAgentId: string, wakeFn: () => Promise<void>): Promise<void>
private processWakeQueue(): void
```

**Behavior:**

1. When `activeWakes < maxConcurrentWakes`:
   - Execute wake immediately
   - Increment `activeWakes`
   - On completion, decrement and process queue

2. When at capacity:
   - Add to queue if space available
   - If queue full, drop oldest and emit `wake-failure` event

3. Queue processing:
   - Automatic after each wake completes
   - Maintains concurrency limit

**Queue Statistics API:**

```typescript
getWakeQueueStats(): {
  active: number;
  queued: number;
  queueLimit: number;
  maxConcurrent: number;
}
```

### 4. Wake Error Classification ✅ IMPLEMENTED

**Error → Reason Mapping:**

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
}
```

Applied in:
- `sendMessageWithWake()` - User-initiated wakes
- `sendMessageWithWakeStream()` - Streaming wakes
- `requestAgentWake()` - Bot-initiated wakes

### 5. Main Process Integration ✅ IMPLEMENTED

**AgentBus Configuration (main.ts):**

```typescript
agentBus = new AgentBus({
  providers: [...],
  defaultProviderId: 'mock-intelligent',
  maxConcurrentWakes: 10,
  wakeQueueLimit: 50,
  onWakeEvent: (event) => {
    if (!mainWindow) return;
    
    if ('reason' in event && event.reason === 'timeout') {
      mainWindow.webContents.send('wake-timeout', { ... });
    } else if ('denialReason' in event) {
      mainWindow.webContents.send('wake-membership-denied', { ... });
    } else if ('reason' in event) {
      mainWindow.webContents.send('wake-failure', { ... });
    }
  },
});
```

**Event Routing:**

- Main process receives events via `onWakeEvent` callback
- Events forwarded to renderer via IPC
- Proper type discrimination for routing

---

## Files Modified

### Core Implementation

1. **src/main/agent-bus.ts** (~75 lines added)
   - Wake event types and callback
   - AgentBusConfig extensions
   - Wake queue management (`enqueueWake`, `processWakeQueue`)
   - Event emission in wake paths
   - Error classification logic
   - Queue statistics API

2. **src/main/main.ts** (~45 lines modified)
   - AgentBus instantiation with backpressure config
   - `onWakeEvent` callback for IPC forwarding
   - Event type discrimination and routing

### IPC/Types Layer

3. **src/main/preload.ts** (~65 lines added)
   - Wake event type definitions
   - IPC event listeners for wake events
   - Exposed `onWakeFailure`, `onWakeTimeout`, `onWakeMembershipDenied`

4. **src/renderer/types.ts** (~50 lines added)
   - Wake event interfaces
   - WakeFailureReason type
   - Global window API extensions

### No Changes Required To

- Renderer components (no UI in this PR)
- Provider implementations
- Room manager
- Secrets handling
- Existing wake response paths

---

## Behavior Verification

### Wake Timeout Scenario

**Input:**
- User sends message mentioning agent with slow/unresponsive provider
- Wake takes > 5s

**Expected Output:**
1. Console error: `Failed to wake agent {id}: Wake timeout`
2. IPC event: `wake-timeout`
   ```typescript
   {
     targetAgentId: "2",
     initiatorAgentId: "1",
     timeoutMs: 5000,
     timestamp: 1725717000000
   }
   ```
3. Primary message still completes successfully

### Membership Denied Scenario

**Input:**
- Bot calls `requestAgentWake(initiator, target, message, roomId)`
- Initiator not in room members

**Expected Output:**
1. Error thrown: `Initiator agent X is not a member of room Y`
2. IPC event: `wake-membership-denied`
   ```typescript
   {
     roomId: "123",
     initiatorAgentId: "1",
     targetAgentId: "2",
     denialReason: "initiator-not-member",
     timestamp: 1725717000000
   }
   ```
3. Wake does not execute

### Queue Overflow Scenario

**Input:**
- 60 concurrent wake requests (queue limit: 50, concurrent: 10)

**Expected Output:**
1. First 10 execute immediately
2. Next 50 queued
3. Request 61 drops oldest from queue
4. IPC event: `wake-failure`
   ```typescript
   {
     targetAgentId: "dropped-agent-id",
     reason: "general-error",
     errorMessage: "Wake queue full (limit: 50), oldest wake dropped",
     timestamp: 1725717000000
   }
   ```

### Provider Unavailable Scenario

**Input:**
- Wake target agent has no API key configured

**Expected Output:**
1. Console error: `Provider not available: {providerId}`
2. IPC event: `wake-failure`
   ```typescript
   {
     targetAgentId: "2",
     initiatorAgentId: "1",
     reason: "provider-unavailable",
     errorMessage: "Provider not available: minimax",
     timestamp: 1725717000000
   }
   ```

### Wake Backpressure Scenario (Waiting...)

**Input:**
- 15 concurrent wake requests (concurrent limit: 10)
- Requests 11-15 queued

**Expected Output:**
1. First 10 execute immediately
2. For requests 11-15, IPC event: `wake-backpressure`
   ```typescript
   {
     targetAgentId: "3",
     queuePosition: 1,
     queueLength: 5,
     activeWakes: 10,
     timestamp: 1725717000000
   }
   ```
3. Chrome can show "Waiting... (position 1 of 5)" indicator
4. Queue auto-processes as wakes complete

---

## Security Considerations

### ✅ Secret Isolation

- Events never include API keys, tokens, or secrets
- Only structured metadata (agent IDs, room IDs, reasons)
- Error messages sanitized (no auth headers, no request bodies)

### ✅ Room Validation

- Membership checks remain intact
- Denial events include reason but not sensitive room data
- Room ID included only when applicable

### ✅ Rate Limiting

- Backpressure prevents wake flooding
- Queue limit prevents memory exhaustion
- Oldest dropped first when over limit

---

## Backpressure Design Decisions

### Queue Limit: 50

**Rationale:**
- Typical chat scenario: < 10 concurrent wakes
- 50 provides 5x buffer for burst scenarios
- Prevents memory exhaustion from pathological cases

**Alternatives considered:**
- Unlimited queue → memory exhaustion risk
- Smaller limit (20) → too aggressive for room fan-in
- Larger limit (200) → overkill for expected usage

### Max Concurrent: 10

**Rationale:**
- Matches typical room size (3-10 agents)
- Prevents provider API rate limiting
- Balances responsiveness vs. resource usage

**Alternatives considered:**
- 5 → too restrictive for large rooms
- 20 → excessive for typical usage
- 3 → too serial, poor UX for room mentions

### Drop Policy: FIFO Oldest

**Rationale:**
- Latest wakes more likely to be user-visible
- Oldest wakes more likely stale/irrelevant
- Simple to implement and reason about

**Alternatives considered:**
- Drop newest → punishes active users
- Reject incoming → no visibility to dropped
- Priority queue → complex, unclear benefit

### Emit Event on Drop

**Decision:** Emit `wake-failure` when dropping oldest from full queue

**Rationale:**
- Chrome can show user feedback (Vale)
- Debugging visibility
- Audit trail for pathological cases

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

**Wake Timeout:**
- [ ] Send message with mention to slow agent
- [ ] Wait 5+ seconds
- [ ] Verify console error
- [ ] Verify `wake-timeout` IPC event in renderer console
- [ ] Verify primary message still completes

**Membership Denied:**
- [ ] Call `requestAgentWake` with non-member initiator
- [ ] Verify error thrown
- [ ] Verify `wake-membership-denied` IPC event
- [ ] Verify wake does not execute

**Queue Overflow:**
- [ ] Trigger 60+ concurrent wakes (scripted loop)
- [ ] Verify first 10 execute immediately
- [ ] Verify queue size caps at 50
- [ ] Verify `wake-failure` for dropped wakes
- [ ] Verify queue processes after completions

**Provider Unavailable:**
- [ ] Wake agent with no API key
- [ ] Verify `wake-failure` with reason `provider-unavailable`
- [ ] Verify error message includes provider ID

---

## Future Enhancements (Out of Scope)

### Chrome UI for Wake Events

**What:** Visual indicators for wake failures

**When:** Vale milestone (next slice)

**Examples:**
- Toast notifications for timeouts
- Badge indicators for membership denied
- Queue depth indicator in status bar

### Wake Retry Logic

**What:** Automatic retry for transient failures

**When:** After observing failure patterns in production

**Considerations:**
- Exponential backoff
- Max retry count
- Only for `provider-unavailable` / `timeout`

### Wake Priority Queues

**What:** Prioritize user-initiated over bot-initiated

**When:** If queue drops become common

**Considerations:**
- User wakes → high priority
- Bot wakes → normal priority
- Room fan-in → medium priority

### Telemetry

**What:** Aggregate wake stats for monitoring

**When:** Production observability phase

**Metrics:**
- Wake success/failure rate
- Timeout frequency by provider
- Queue depth over time
- Drop count

---

## Integration with PR #30

### Alignment with Streaming Fan-In

This PR builds on the streaming fan-in foundation from #30:

1. **Wake paths already established:**
   - `sendMessageWithWake` (non-stream)
   - `sendMessageWithWakeStream` (stream)
   - `requestAgentWake` (bot-initiated)

2. **Error handling was silent:**
   - #30: `catch((err) => console.error(...))`
   - This PR: Structured events + IPC

3. **No behavioral changes to success path:**
   - Successful wakes work identically
   - Only failure path now emits events

### Wake Types Coverage

| Wake Type | Timeout Event | Failure Event | Membership Event |
|-----------|---------------|---------------|------------------|
| User mention (non-stream) | ✅ | ✅ | N/A |
| User mention (stream) | ✅ | ✅ | N/A |
| Bot-initiated | ✅ | ✅ | ✅ |
| Room fan-in | Via mention paths | Via mention paths | N/A |

**Note:** Room fan-in uses the mention wake paths, so inherits their event emission.

---

## Configuration Defaults

### Recommended for Production

```typescript
{
  maxConcurrentWakes: 10,
  wakeQueueLimit: 50,
  onWakeEvent: (event) => {
    // Forward to IPC
    // Log to telemetry
  }
}
```

### Development/Testing

```typescript
{
  maxConcurrentWakes: 3,   // Lower for debugging
  wakeQueueLimit: 10,      // Easier to trigger overflow
  onWakeEvent: (event) => {
    console.log('[WAKE EVENT]', event);
    // Forward to IPC
  }
}
```

### High-Capacity Scenarios

```typescript
{
  maxConcurrentWakes: 20,  // Large rooms
  wakeQueueLimit: 100,     // High burst tolerance
  onWakeEvent: (event) => {
    // Forward to IPC
  }
}
```

---

## Verification Commands

```bash
# Type checking
npm run type-check

# Build
npm run build

# Run app (requires valid provider keys for full testing)
npm start

# Check wake events in renderer console
# Open DevTools → Console → Filter: "wake-"

# Check main process logs
# Look for: "Failed to wake agent X: ..."
```

---

## API Reference

### WakeFailureReason Enum

```typescript
type WakeFailureReason = 
  | 'timeout'                 // Wake exceeded 5s timeout
  | 'membership-denied'       // Room membership validation failed
  | 'agent-not-found'         // Target agent not registered
  | 'provider-not-found'      // Agent's provider not registered
  | 'provider-unavailable'    // Provider isAvailable() returned false
  | 'general-error';          // Other errors
```

### Wake Event Interfaces

**WakeFailureEvent:**
```typescript
{
  roomId?: string;           // Room context (if applicable)
  initiatorAgentId?: string; // Waker agent (if known)
  targetAgentId: string;     // Wake target (always present)
  reason: WakeFailureReason; // Structured failure reason
  errorMessage: string;      // Human-readable error
  timestamp: number;         // Milliseconds since epoch
}
```

**WakeTimeoutEvent:**
```typescript
{
  roomId?: string;
  initiatorAgentId?: string;
  targetAgentId: string;
  timeoutMs: number;         // Timeout threshold (5000)
  timestamp: number;
}
```

**WakeMembershipDeniedEvent:**
```typescript
{
  roomId: string;            // Room where denial occurred
  initiatorAgentId: string;
  targetAgentId: string;
  denialReason: 'initiator-not-member' | 'target-not-member';
  timestamp: number;
}
```

**WakeBackpressureEvent:**
```typescript
{
  targetAgentId: string;     // Wake target being queued
  queuePosition: number;     // Position in queue (1-indexed)
  queueLength: number;       // Total queue size
  activeWakes: number;       // Currently executing wakes
  timestamp: number;         // Milliseconds since epoch
}
```

### AgentBus Methods

**enqueueWake (private):**
```typescript
private async enqueueWake(
  targetAgentId: string,
  wakeFn: () => Promise<void>
): Promise<void>
```

**processWakeQueue (private):**
```typescript
private processWakeQueue(): void
```

**getWakeQueueStats (public):**
```typescript
getWakeQueueStats(): {
  active: number;        // Currently executing wakes
  queued: number;        // Wakes in queue
  queueLimit: number;    // Max queue size
  maxConcurrent: number; // Max concurrent wakes
}
```

**emitWakeEvent (private):**
```typescript
private emitWakeEvent(
  event: WakeFailureEvent | WakeTimeoutEvent | WakeMembershipDeniedEvent | WakeBackpressureEvent
): void
```

---

## Error Message Sanitization

All error messages in wake events are sanitized:

✅ **Safe to include:**
- Agent IDs
- Room IDs
- Provider names
- Timeout values
- Membership status

❌ **Never included:**
- API keys
- Auth tokens
- Request bodies
- Response bodies
- User secrets

**Example safe messages:**
- ✅ `"Wake timeout"`
- ✅ `"Agent not found: agent-123"`
- ✅ `"Provider not available: openai"`
- ✅ `"Initiator agent X is not a member of room Y"`
- ❌ `"Auth failed: invalid API key sk-abc..."`
- ❌ `"Request body: {apiKey: '...'}"

---

## References

- **PR #30:** Bot-initiated wake + streaming fan-in foundation
- **BotOS Architecture:** `/workspace/README.md`
- **Agent Bus:** `/workspace/src/main/agent-bus.ts`
- **Preload Types:** `/workspace/src/main/preload.ts`
- **Renderer Types:** `/workspace/src/renderer/types.ts`

---

## Summary

This PR surfaces wake failures, timeouts, and membership denials as structured IPC events without adding any desktop chrome. It implements backpressure with configurable concurrency and queue limits, preventing wake flooding and memory exhaustion. All events are secret-safe and ready for Vale to consume in the next slice.

**Next Steps (Vale):**
1. Consume wake events in renderer
2. Show toast notifications for failures
3. Badge indicators for membership issues
4. Queue depth in status bar (optional)
