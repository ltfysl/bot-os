# Paths Hardened - Complete List

## Modified Paths (This PR)

### 1. Room Broadcast - Non-Streaming
**File:** `src/main/main.ts`  
**Handler:** `ipcMain.handle('send-room-message', ...)`  
**Lines:** ~499-540  
**Fan-out loop:** `mentionedAgentIds.forEach((agentId) => { ... })`

**Change:**
```diff
+ if (!room.memberAgentIds.includes(agentId)) {
+   event.sender.send('wake-membership-denied', {
+     roomId,
+     initiatorAgentId: senderId || 'system',
+     targetAgentId: agentId,
+     denialReason: 'target-not-member',
+     timestamp: Date.now(),
+   });
+   return;
+ }
  const agent = agentBus.getAgent(agentId);
```

**Protection:** Non-members denied BEFORE `agentBus.sendMessage()` call.

---

### 2. Room Broadcast - Streaming
**File:** `src/main/main.ts`  
**Handler:** `ipcMain.handle('send-room-message-stream', ...)`  
**Lines:** ~608-658  
**Fan-out loop:** `mentionedAgentIds.forEach((agentId) => { ... })`

**Change:**
```diff
+ if (!room.memberAgentIds.includes(agentId)) {
+   event.sender.send('wake-membership-denied', {
+     roomId,
+     initiatorAgentId: senderId || 'system',
+     targetAgentId: agentId,
+     denialReason: 'target-not-member',
+     timestamp: Date.now(),
+   });
+   return;
+ }
  const agent = agentBus.getAgent(agentId);
```

**Protection:** Non-members denied BEFORE `agentBus.sendMessageWithWakeStream()` call.

---

## Already Safe Paths (No Changes)

### 3. Direct Agent Wake
**File:** `src/main/agent-bus.ts`  
**Method:** `requestAgentWake(initiatorAgentId, targetAgentId, message, roomId?)`  
**Lines:** ~311-421

**Existing protection (lines 346-380):**
- Validates initiator is room member
- Validates target is room member
- Emits `wake-membership-denied` with proper reasons
- Checks happen BEFORE `enqueueWake`

**Status:** ✅ Already hardened in current main

---

### 4. Mention-Based Wake (Non-Streaming)
**File:** `src/main/agent-bus.ts`  
**Method:** `sendMessageWithWake(message, agentId, context?, onWakeResponse?)`  
**Lines:** ~135-186

**Current main:** No early membership checks for room-context wakes.

**PR #38:** Adds early membership validation (lines 160-180 in PR #38 diff).

**Our approach:** Independent PR targeting room broadcast in `main.ts`, not duplicating PR #38's work.

---

### 5. Mention-Based Wake (Streaming)
**File:** `src/main/agent-bus.ts`  
**Method:** `sendMessageWithWakeStream(message, agentId, context, onPrimaryChunk, onWakeChunk?)`  
**Lines:** ~189-252

**Current main:** No early membership checks for room-context wakes.

**PR #38:** Adds early membership validation (lines 249-269 in PR #38 diff).

**Our approach:** Independent PR targeting room broadcast in `main.ts`, not duplicating PR #38's work.

---

### 6. Room Mention Pre-Filter
**File:** `src/main/main.ts`  
**Function:** `extractRoomMentions(message, memberAgentIds)`  
**Lines:** ~690-703

**Existing logic:**
- Only returns agents who are BOTH mentioned AND in `memberAgentIds`
- Pre-filters before fan-out loops

**Defense in depth:** Our changes (items 1-2) add a second check at execution time.

---

## Coverage Summary

| Path | Location | Protection | Status |
|------|----------|------------|--------|
| Room broadcast (non-stream) | `main.ts:499` | Early membership check | ✅ This PR |
| Room broadcast (streaming) | `main.ts:608` | Early membership check | ✅ This PR |
| Direct agent wake | `agent-bus.ts:311` | Existing validation | ✅ Already safe |
| Mention wake (non-stream) | `agent-bus.ts:135` | PR #38 adds checks | 🔄 PR #38 |
| Mention wake (streaming) | `agent-bus.ts:189` | PR #38 adds checks | 🔄 PR #38 |
| Mention pre-filter | `main.ts:690` | Member-only filter | ✅ Already safe |

---

## Event Emission Points

All membership denials now emit consistent events at these points:

1. **Room broadcast (non-stream):** `main.ts:500-507` (this PR)
2. **Room broadcast (streaming):** `main.ts:609-616` (this PR)  
3. **Direct agent wake (initiator):** `agent-bus.ts:359-366` (existing)
4. **Direct agent wake (target):** `agent-bus.ts:372-378` (existing)
5. **Mention wake (non-stream, PR #38):** `agent-bus.ts:168-175` (PR #38)
6. **Mention wake (streaming, PR #38):** `agent-bus.ts:257-264` (PR #38)

**All use the same event shape:** `WakeMembershipDeniedEvent`

---

## Defense in Depth

```
Layer 1: extractRoomMentions pre-filter (member-only list)
         ↓
Layer 2: Early membership check in IPC handler (THIS PR)
         ↓
Layer 3: Agent bus method call
         ↓
Layer 4: (PR #38) Membership check inside bus methods
```

Multiple layers ensure non-members never consume resources, even if upstream logic has bugs.
