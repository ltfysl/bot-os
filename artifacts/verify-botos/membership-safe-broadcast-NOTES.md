# Membership-Safe Broadcast Polish - Verification Notes

**Branch:** `cursor/membership-safe-broadcast-afea`  
**Base:** `main` (commit 9f7e315 - includes merged PR #38)  
**Tip SHA:** `0d24882` (rebased onto main @ 9f7e315)  
**PR Context:** Independent from PR #38 (streaming backpressure), fills gaps in room broadcast fan-out paths

## Rebase History

- **Original base:** main @ 6eff282 (pre-PR #38)
- **Original tip:** 3c91f4f
- **Rebased onto:** main @ 9f7e315 (post-PR #38 merge, includes commits 9c5cc85, 9779fbe, a2a7eee, 4e67b5d, 9f7e315)
- **New tip:** 0d24882
- **Conflicts:** None (clean rebase)
- **Rebase date:** 2026-09-14

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
  denialReason: 'initiator-not-member' | 'target-not-member';
  timestamp: number;
}
```

This matches the `WakeMembershipDeniedEvent` interface from `agent-bus.ts` and `preload.ts`.

### Denial Reason Accuracy

**This PR's changes (main.ts room broadcast):**
- ✅ **Accurate:** Uses `'target-not-member'` only when `!room.memberAgentIds.includes(agentId)`
- ✅ **Valid room context:** Room object already validated before membership check
- ✅ **Genuine membership denial:** Target agent is not in the room's member list

**Soft carry note from Remy (PR #38 merged code in agent-bus.ts):**

Lines 169-175 and 180-187 in `agent-bus.ts` use `'target-not-member'` for:
- Missing `roomManagerInstance` (infrastructure issue)
- Missing `room` (data lookup failure)

These are **fail-closed** (deny access) but the denial reason is technically imprecise - these are system/data errors, not membership issues. However:

- ✅ **Closed type:** `denialReason` is limited to `'initiator-not-member' | 'target-not-member'`
- ✅ **Out of scope:** Expanding the type would require changes to type definitions, preload, and potentially UI
- ✅ **Acceptable:** Fail-closed behavior is correct (deny when unsure), just less precise on "why"
- 📋 **Future consideration:** Could add denial reasons like `'room-not-found'` or `'system-error'` if type expanded

**Decision:** Left as-is per "if type is closed, leave soft" guidance. This PR does not expand scope to modify denial reason types.

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

**PR #38 status:** ✅ **MERGED** to main @ 9f7e315 (includes commits 9c5cc85, 9779fbe, a2a7eee, 4e67b5d)

**PR #38 added:** 
- Streaming backpressure queue support with resolve/reject promises
- Early membership checks for mention-based wakes INSIDE `agent-bus.ts` methods (`sendMessageWithWake`, `sendMessageWithWakeStream`)
- Fail-closed membership validation (deny when roomManager or room not found)

**This PR adds:** 
- Early membership checks for room broadcast fan-out loops in `main.ts` IPC handlers BEFORE calling agent methods
- Consistent `wake-membership-denied` events at IPC layer

**Complementary hardening:**
- PR #38: Protects mention extraction inside bus methods
- This PR: Protects room broadcast fan-out before entering bus methods

**Rebase result:** Clean rebase with no conflicts. Changes are orthogonal (different files/scopes).

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

✅ **Build successful after rebase!**

**Post-rebase build (tip 0d24882):**
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
✓ built in 924ms
```

**TypeScript:** ✅ Clean compile, no type errors  
**Vite:** ✅ Clean bundle, 1857 modules transformed successfully

Full output: `artifacts/verify-botos/build-output-rebased.txt`
