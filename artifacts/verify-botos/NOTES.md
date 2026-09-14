# Bot-Initiated Wake Reliability — Implementation Notes

## Audit Summary

**Audited**: All bot-initiated wake entry points in `agent-bus.ts` and `main.ts`  
**Finding**: PR #38 successfully hardened all true wake paths  
**Status**: ✅ **All bot→bot wake invariants enforced**

---

## Compliant Wake Paths

### 1. Mention-Based Wakes (Non-Streaming)
**File**: `agent-bus.ts:140-233` (`sendMessageWithWake`)  
**Trigger**: User/bot mentions agent via `@name` in message  
**Invariants**:
- ✅ Fail-closed membership (lines 160-200)
- ✅ Backpressure via `enqueueWake()` (line 230)
- ✅ Error classification & wake-failure events (lines 207-227)
- ✅ Timeout with wake-timeout events (5s, via `wakeAgent()`)
- ✅ Slot cleanup (handled by `enqueueWake` promise chain)

### 2. Mention-Based Wakes (Streaming)
**File**: `agent-bus.ts:236-342` (`sendMessageWithWakeStream`)  
**Trigger**: Streaming variant of mention-based wakes  
**Invariants**:
- ✅ Fail-closed membership (lines 271-311)
- ✅ Backpressure via `enqueueWake()` (line 340)
- ✅ Error classification & wake-failure events (lines 316-337)
- ✅ Timeout with wake-timeout events (5s, via `wakeAgentStream()`)
- ✅ Slot cleanup (handled by `enqueueWake` promise chain)

### 3. Explicit Bot-to-Bot Wake API
**File**: `agent-bus.ts:400-516` (`requestAgentWake`)  
**Trigger**: IPC call `request-agent-wake` from renderer/agent  
**Invariants**:
- ✅ Fail-closed membership with upfront validation (lines 434-469)
- ✅ Agent existence validation (lines 406-432)
- ✅ Backpressure via `await enqueueWake()` (line 516)
- ✅ Error classification & wake-failure events (lines 490-512)
- ✅ Timeout with wake-timeout events (5s, lines 474-485)
- ✅ Slot cleanup (handled by `enqueueWake` promise chain)

**Note**: This is the cleanest explicit wake API with comprehensive pre-flight checks.

---

## Architectural Observation: Room Broadcasts vs. Wakes

### Room Message Handlers (main.ts:450-650)

**Behavior**: When a message is sent to a room:
1. If @mentions present → Uses wake paths (✅ compliant)
2. If NO @mentions but `senderId` set → Direct `sendMessage()` call (⚠️ bypasses wake semantics)

**Analysis**:
- Non-mention room messages call `agentBus.sendMessage()` directly (lines 476, 507)
- `sendMessage()` is a synchronous message delivery, NOT a wake
- Does NOT use `enqueueWake()`, emit wake events, or enforce backpressure
- These are **room broadcast messages**, not **bot-initiated wakes**

**Semantic Distinction**:
- **Wake**: Bot explicitly targeting another bot for activation (with mention or `requestAgentWake`)
- **Room Broadcast**: Bot sending message to room, all members receive (no targeting)

**Interpretation**: Room broadcasts without @mentions are not "wakes" per the task definition:
- Task scope: "agent waking another agent, DM wakes, room targeted wakes started by an agent"
- "Room targeted wakes" = wakes targeting specific agents in a room context (i.e., mentions)
- Broadcasts without mentions = ambient room messages, not targeted wakes

**Conclusion**: No code changes needed. Room broadcasts are architecturally distinct from wakes.

---

## Verification Evidence

### Type Safety
- All wake event types defined: `WakeFailureEvent`, `WakeTimeoutEvent`, `WakeMembershipDeniedEvent`, `WakeBackpressureEvent`
- Types synchronized across agent-bus.ts, preload.ts, renderer/types.ts
- IPC handlers properly typed

### Build Verification
```bash
$ npm run type-check
✅ Exit 0 — No type errors

$ npm run build
✅ Exit 0 — Clean build
```

### Wake Queue Implementation
**File**: `agent-bus.ts:697-760` (`enqueueWake`, `processWakeQueue`, `getWakeQueueStats`)

**Backpressure Mechanism**:
- Max concurrent wakes: 10 (configurable)
- Queue limit: 50 (configurable)
- FIFO queue with overflow handling (oldest dropped, emits wake-failure)
- Slot tracking: `activeWakes` incremented/decremented with finally blocks
- Queue processing: Automatic dequeue when slots free up

**Event Emission**:
- Backpressure event on enqueue (line 720-726)
- Failure event on queue overflow (line 711-717)
- All paths emit events via `emitWakeEvent()` (lines 690-694)

---

## Gap Analysis: None Found

**Original Concern**: "Ensure every bot-initiated wake goes through enqueueWake/backpressure"

**Audit Result**: All paths matching the semantic definition of "bot-initiated wake" already enforce backpressure:
1. ✅ Mention-based wakes (both streaming and non-streaming)
2. ✅ Explicit `requestAgentWake()` API
3. ✅ DM wakes (handled by mention paths)
4. ✅ Room targeted wakes (mention-based in room context)

**Non-Wake Paths** (intentionally outside scope):
- Room broadcast messages without @mentions (not targeted, not wakes)
- Direct `sendMessage()` calls (synchronous message delivery, not wake semantics)

---

## Recommendation: Audit-Only PR

**Rationale**:
- PR #38 completed the wake hardening work
- All true wake paths enforce backpressure, membership, error signaling, and slot cleanup
- No additional code changes needed
- Room broadcasts are architecturally distinct and correctly implemented

**Deliverables**:
1. ✅ This NOTES.md document
2. ✅ AUDIT.md with detailed path-by-path analysis
3. ✅ Clean typecheck + build verification
4. Draft PR documenting audit findings

**PR Title**: `feat(bus): bot-initiated wake reliability audit`  
**PR Body**: Reference audit documents, confirm all wake paths compliant after PR #38

---

## Alternative: Minimal Gap-Fill PR

If task requires closing the room broadcast "gap" (unlikely):

**Changes Needed**:
1. Wrap non-mention room sends in wake semantics
2. Add `enqueueWake()` calls for sender-initiated broadcasts
3. Emit wake events for broadcast failures
4. Update room handlers: `send-room-message` (lines 469-495), `send-room-message-stream` (lines 552-594)

**Risk**: May conflict with PR #39 (membership-safe broadcast polish)  
**Complexity**: Medium — needs careful coordination with broadcast semantics

**Not Recommended**: Would be inventing chrome for non-wake paths.

---

## Conclusion

**All bot-initiated wake entry points are compliant with the task's reliability invariants after PR #38.**

No code changes needed. Ship audit documentation as evidence.
