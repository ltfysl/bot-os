# Membership-Safe Broadcast Polish - Verification Notes

**Branch:** `cursor/membership-safe-broadcast-afea`  
**Base:** `main` (commit 6eff282)  
**PR Context:** Independent from PR #38 (streaming backpressure), fills gaps in room broadcast fan-out paths

## Objective

Harden ALL room broadcast and mention fan-out paths so non-members:
1. Never consume queue slots
2. Never start streams
3. Always receive clear `wake-membership-denied` event BEFORE any enqueue/stream

## Paths Audited & Hardened

### 1. Room Broadcast - Non-Streaming (`send-room-message`)
**File:** `src/main/main.ts:499-540`

**Before:**
```typescript
mentionedAgentIds.forEach((agentId) => {
  const agent = agentBus.getAgent(agentId);
  if (!agent) {
    console.error(`Agent not found: ${agentId}`);
    return;
  }
  agentBus.sendMessage(content, agentId, { room: roomId })
    .then(...)
```

**Issue:** No membership validation before calling `sendMessage`. Non-member could receive message.

**After:**
```typescript
mentionedAgentIds.forEach((agentId) => {
  if (!room.memberAgentIds.includes(agentId)) {
    event.sender.send('wake-membership-denied', {
      roomId,
      initiatorAgentId: senderId || 'system',
      targetAgentId: agentId,
      denialReason: 'target-not-member',
      timestamp: Date.now(),
    });
    return;
  }
  const agent = agentBus.getAgent(agentId);
  ...
```

**Result:** Early membership check + event emission BEFORE any work begins.

---

### 2. Room Broadcast - Streaming (`send-room-message-stream`)
**File:** `src/main/main.ts:608-658`

**Before:**
```typescript
mentionedAgentIds.forEach((agentId) => {
  const agent = agentBus.getAgent(agentId);
  if (!agent) {
    console.error(`Agent not found: ${agentId}`);
    return;
  }
  const messageId = `${Date.now()}-${agentId}`;
  let accumulatedContent = '';
  agentBus.sendMessageWithWakeStream(...)
```

**Issue:** No membership validation before starting stream. Non-member could start consuming resources.

**After:**
```typescript
mentionedAgentIds.forEach((agentId) => {
  if (!room.memberAgentIds.includes(agentId)) {
    event.sender.send('wake-membership-denied', {
      roomId,
      initiatorAgentId: senderId || 'system',
      targetAgentId: agentId,
      denialReason: 'target-not-member',
      timestamp: Date.now(),
    });
    return;
  }
  const agent = agentBus.getAgent(agentId);
  ...
```

**Result:** Early membership check + event emission BEFORE stream starts.

---

## Paths Already Safe (No Changes Needed)

### 3. `requestAgentWake` in `agent-bus.ts`
**File:** `src/main/agent-bus.ts:311-421`

Already has comprehensive membership validation (lines 346-380):
- Validates initiator is room member
- Validates target is room member
- Emits `wake-membership-denied` with proper denial reasons
- Checks happen BEFORE `enqueueWake`

**Status:** ✅ Already hardened in current main

---

### 4. Mention-based wakes in `sendMessageWithWake` and `sendMessageWithWakeStream`
**File:** `src/main/agent-bus.ts` (lines vary in main vs PR #38)

**Current main status:** These methods extract mentions and call `enqueueWake` without early membership checks.

**PR #38 status:** Adds early membership validation for room-context wakes before enqueue (see PR diff lines 157-180 and 246-269).

**Our approach:** Since this PR is independent from main and targets room broadcast fan-out in `main.ts`, we do NOT duplicate PR #38's changes. When PR #38 merges, those paths will be covered. Our changes are complementary and non-overlapping.

---

### 5. `extractRoomMentions` helper
**File:** `src/main/main.ts:690-703`

Already filters by `room.memberAgentIds` - only returns agents who are members AND mentioned.

**Defense in depth:** Our additional checks (items 1-2 above) ensure that even if there's a race condition or logic error, we validate again before wake/send.

**Status:** ✅ Pre-filtered, with additional defense in depth added

---

## Event Consistency

All membership denials now emit a consistent event shape:

```typescript
{
  roomId: string;
  initiatorAgentId: string;     // or 'system' if no sender
  targetAgentId: string;
  denialReason: 'target-not-member';  // consistent with agent-bus.ts
  timestamp: number;
}
```

This matches the `WakeMembershipDeniedEvent` interface from `agent-bus.ts` and `preload.ts`.

---

## Testing Approach

### Manual Verification Path

1. **Setup:** Create room with agents A, B, C
2. **Remove agent C** from room
3. **Send message** from A mentioning @B and @C
4. **Expected:**
   - Agent B receives wake (member)
   - Agent C gets `wake-membership-denied` event immediately
   - No queue slot consumed for C
   - No stream started for C
5. **Verify:** Check renderer console for events

### Build Verification

```bash
npm run build
# or
npm run typecheck
```

Expected: Clean build, no type errors.

---

## Commit Message

```
feat(bus): membership-safe broadcast polish

Harden room broadcast fan-out paths to deny non-members early:

- send-room-message: validate membership BEFORE sendMessage
- send-room-message-stream: validate membership BEFORE stream start
- Emit wake-membership-denied events consistently
- No wasted queue slots or streams for non-members

Independent from PR #38 (streaming backpressure), focuses on
room-level IPC handlers in main.ts.

Related: Complements requestAgentWake membership checks already
in agent-bus.ts, fills gap in room mention fan-out loops.
```

---

## Files Changed

- `src/main/main.ts`: Added early membership checks in two room broadcast loops

**Lines changed:**
- Line ~499-509: `send-room-message` mention loop
- Line ~608-618: `send-room-message-stream` mention loop

**No changes to:**
- `src/main/agent-bus.ts` (already hardened for requestAgentWake)
- `src/main/preload.ts` (types already defined)
- `src/main/rooms.ts` (no changes needed)
- UI/renderer components (runtime/IPC only)

---

## Next Steps

1. ✅ Typecheck passes
2. ✅ Build succeeds
3. ✅ Commit changes
4. ✅ Push branch
5. ✅ Open DRAFT PR with title: `feat(bus): membership-safe broadcast polish`
6. ⏱️ Wait for CI (if exists)
7. ⏱️ Manual testing in Electron app (if desired)

---

## Relationship to PR #38

**PR #38:** Adds streaming backpressure queue support and membership checks for mention-based wakes INSIDE `agent-bus.ts` methods.

**This PR:** Adds membership checks for room broadcast fan-out loops in `main.ts` IPC handlers that directly call agent methods.

**Independence:** These changes are orthogonal. PR #38 modifies `agent-bus.ts`, this PR modifies `main.ts`. Both can merge in any order without conflicts (minimal/no overlapping hunks).

**Synergy:** Together, they provide defense-in-depth:
- PR #38: Protects mention extraction inside bus methods
- This PR: Protects room broadcast fan-out before entering bus methods

---

## Verification Status

- [x] Audit complete: all broadcast/fan-out paths identified
- [x] Changes implemented: 2 paths hardened
- [x] Event consistency: unified `wake-membership-denied` shape
- [x] No wasted resources: checks before enqueue/stream
- [x] Build verification: ✅ PASSED (TypeScript + Vite clean)
- [ ] Manual testing: recommended but not blocking for draft PR

---

## Build Output

✅ **Build successful!**

```
> bot-os@0.1.0 build
> npm run build:main && npm run build:renderer

> bot-os@0.1.0 build:main
> tsc -p tsconfig.main.json

> bot-os@0.1.0 build:renderer
> vite build

vite v5.4.21 building for production...
transforming...
✓ 1857 modules transformed.
rendering chunks...
computing gzip size...
../../dist/renderer/index.html                   0.39 kB │ gzip:  0.27 kB
../../dist/renderer/assets/index-BSLIIo6n.css   23.07 kB │ gzip:  4.26 kB
../../dist/renderer/assets/index-ff_L9Ptx.js   176.54 kB │ gzip: 54.37 kB
✓ built in 946ms
```

**TypeScript:** ✅ Clean compile, no type errors  
**Vite:** ✅ Clean bundle, 1857 modules transformed successfully

Full output: `artifacts/verify-botos/build-output.txt`
