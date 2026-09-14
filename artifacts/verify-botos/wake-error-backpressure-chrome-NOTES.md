# Wake Error & Backpressure Chrome - Verification Notes

**Feature:** Wire wake-failure, wake-timeout, wake-membership-denied, and wake-backpressure IPC events to desktop UI chrome  
**PR Branch:** `cursor/wake-error-backpressure-chrome-c110`  
**Depends on:** PR #35 (IPC events landed in `main` at `30a2e99`)  
**Date:** 2026-09-14

---

## Implementation Summary

This implementation adds desktop UI chrome to display wake errors and backpressure state in both 1:1 chat and room contexts. It follows the **Nyx feel bar** specification: compact, inline error rows with AlertCircle icon, no toast stacks or full-width banners.

### Key Components Modified

1. **ChatView.tsx** - Added wake event subscriptions for 1:1 chats
2. **RoomView.tsx** - Added wake event subscriptions for room fan-in
3. **MessageList.tsx** - Renders wake error rows in transcript
4. **MessageComposer.tsx** - Shows backpressure "Waiting…" indicator
5. **index.css** - Styling for error rows and backpressure indicator

---

## Architecture

### IPC Event Flow

```
Main Process (agent-bus.ts)
  └─> Emits wake events via webContents.send()
      ├─> wake-failure (reason, errorMessage, agentId, roomId)
      ├─> wake-timeout (timeoutMs: 5000)
      ├─> wake-membership-denied (denialReason)
      └─> wake-backpressure (queuePosition, queueLength, activeWakes)

Preload (preload.ts)
  └─> Exposes subscription helpers:
      ├─> onWakeFailure(callback) → unsubscribe
      ├─> onWakeTimeout(callback) → unsubscribe
      ├─> onWakeMembershipDenied(callback) → unsubscribe
      └─> onWakeBackpressure(callback) → unsubscribe

Renderer (ChatView/RoomView)
  └─> Subscribe in useEffect, filter by agent/room ID
      └─> Update local state (wakeErrors[], backpressureState)
          └─> Pass to MessageList/MessageComposer for rendering
```

### Wake Error Event Types

**ChatView context (1:1):**
- Filters by `event.targetAgentId === agent?.id`
- Loads agent name from localStorage for display

**RoomView context (fan-in):**
- Filters by `event.roomId === room.id`
- Loads agent name from `agents` prop

**Common error types:**
- `wake-failure` → Maps reason code to short message
- `wake-timeout` → "Timed out"
- `wake-membership-denied` → "Not a member"

### Reason Code Mapping

```typescript
formatWakeFailureReason(reason: WakeFailureReason): string {
  'agent-not-found' → 'Agent not found'
  'provider-not-found' → 'Provider not found'
  'provider-unavailable' → 'Provider unavailable'
  'membership-denied' → 'Not a member'
  'timeout' → 'Timed out'
  default → 'Wake failed'
}
```

---

## UI Implementation

### Wake Error Row (MessageList)

**Structure:**
```tsx
<div className="message assistant">
  <div className="message-avatar">
    <AlertCircle size={16} strokeWidth={2} />
  </div>
  <div className="message-content">
    <div className="wake-error-row">
      <span className="wake-error-reason">{reason}</span>
      <span className="wake-error-agent">{agentName}</span>
      <button className="wake-error-retry">Retry</button>
    </div>
  </div>
</div>
```

**Styling:**
- Compact: Same gap as regular messages
- AlertCircle icon (lucide-react) in message-avatar slot
- Reason in primary text color, agent name muted
- Optional Retry button: quiet, secondary, inline right-aligned
- Background: `var(--bg-tertiary)`, padding: 8px 12px
- No emoji, no toast, no banner strip

### Backpressure Indicator (MessageComposer)

**Structure:**
```tsx
{backpressureState && (
  <div className="backpressure-indicator">
    Waiting…
  </div>
)}
<div className="compose-wrapper">...</div>
```

**Styling:**
- Muted text: `var(--text-muted)`, 12px
- Centered, above composer input
- Padding: 4px 0 8px
- Appears when `backpressureState` is not null
- Disappears when queue clears

---

## State Management

### ChatView State

```typescript
const [wakeErrors, setWakeErrors] = useState<WakeErrorEvent[]>([]);
const [backpressureState, setBackpressureState] = useState<WakeBackpressureEvent | null>(null);
```

**Wake error lifecycle:**
1. IPC event arrives → added to `wakeErrors[]`
2. Rendered in MessageList as error row
3. User clicks Retry → removed from `wakeErrors[]` via `handleRetryWake`
4. On successful wake response → `setIsLoading(false)`

**Backpressure lifecycle:**
1. IPC event arrives → `setBackpressureState(event)`
2. Rendered in MessageComposer as "Waiting…"
3. When wake completes → backpressure state cleared (manual reset needed in follow-up)

### RoomView State

Same pattern as ChatView, but filters by `roomId` instead of `targetAgentId`.

---

## Type Definitions

### WakeErrorEvent (local interface)

```typescript
interface WakeErrorEvent {
  id: string;
  type: 'wake-failure' | 'wake-timeout' | 'wake-membership-denied';
  reason: string;
  agentName?: string;
  timestamp: number;
}
```

### IPC Event Types (from types.ts)

```typescript
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

---

## Verification Steps

### Type-Check & Build

✅ **Type-Check:** Passed  
✅ **Build:** Passed  

```bash
npm run type-check  # Exit code 0, no errors
npm run build       # Exit code 0, built successfully
```

### Manual Testing (Required)

**1. Launch app:**
```bash
npm start
```

**2. Trigger wake failure:**
- Select an agent without a provider configured
- Send a message that requires a wake
- Verify error row appears with "Provider unavailable"

**3. Trigger wake timeout:**
- Configure agent-bus to emit timeout event after 5s
- Send wake request
- Verify "Timed out" error row appears

**4. Trigger membership denied:**
- In room context, @mention an agent not in the room
- Verify "Not a member" error row appears

**5. Trigger backpressure:**
- Rapid-fire 12+ wake requests (exceeds queue limit)
- Verify "Waiting…" appears under composer
- Verify queue clears when wakes complete

**6. Verify Retry button:**
- Click Retry on error row
- Verify error row disappears
- (Retry logic is placeholder - actual re-wake needs follow-up)

### Screenshots Required

- `wake-failure-row.png` - Error row in transcript
- `wake-timeout-row.png` - Timeout error row
- `backpressure-waiting.png` - Waiting… under composer
- `wake-error-retry.png` - Retry button hover state
- `room-wake-error.png` - Error row in room context

---

## Known Limitations

1. **Retry button is placeholder:** Clicking Retry removes the error row but does not re-fire the wake request. Actual retry logic requires additional IPC call to re-queue the wake.

2. **Backpressure state manual reset:** `backpressureState` is set when event fires but not automatically cleared when queue drains. Need to subscribe to a "backpressure-cleared" event or infer from wake completion.

3. **Agent name lookup in ChatView:** Uses `localStorage.getItem('agents')` to resolve agent names. This is fragile if agent data isn't synced. Better approach: pass agents list as prop from App.tsx.

4. **No timestamp display:** Wake error rows show reason and agent name but not when the error occurred. Consider adding timestamp if errors persist.

5. **No error deduplication:** If the same wake fails multiple times rapidly, multiple error rows appear. Consider deduplicating by `targetAgentId + reason`.

---

## Testing Checklist

- [x] Type-check passes
- [x] Build passes
- [ ] Manual launch (npm start)
- [ ] Wake failure error row renders
- [ ] Wake timeout error row renders
- [ ] Membership denied error row renders
- [ ] Backpressure "Waiting…" renders
- [ ] Retry button clickable (removes row)
- [ ] Error rows in room context
- [ ] No console errors on wake events
- [ ] Screenshots captured in `artifacts/verify-botos/screenshots/`

---

## PR Checklist

- [x] Type-check passes
- [x] Build passes
- [x] NOTES file created in `artifacts/verify-botos/`
- [ ] Manual verification complete (requires app launch)
- [ ] Screenshots attached
- [ ] PR references #35 dependency
- [ ] PR body quotes Nyx feel bar spec
- [ ] PR marked DRAFT until NOTES verified

---

## Follow-Up Work

1. **Implement actual Retry logic:** Wire Retry button to `requestAgentWake` IPC call to re-queue the wake.

2. **Backpressure clear event:** Add IPC event when queue drains so UI can clear "Waiting…" automatically.

3. **Agent name resolution:** Pass agents list as prop to ChatView instead of localStorage lookup.

4. **Error deduplication:** Prevent duplicate error rows for same agent/reason within short time window.

5. **Timestamp display:** Add optional timestamp to error rows for debugging.

6. **Error expiry:** Auto-remove error rows after 30s or on next successful wake.

---

## Files Changed

```
src/renderer/components/ChatView.tsx       +88 lines
src/renderer/components/RoomView.tsx       +147 lines
src/renderer/components/MessageList.tsx    +30 lines
src/renderer/components/MessageComposer.tsx +13 lines
src/renderer/index.css                     +46 lines
```

**Total:** +324 lines, 5 files modified

---

## Commit History

```
4bbaaa6 feat: wire wake-error and backpressure chrome to IPC events
```

---

## Related Issues/PRs

- **PR #35:** IPC events for wake-failure, wake-timeout, wake-membership-denied, wake-backpressure (merged to main)
- **This PR:** Desktop chrome to display those events

---

## Design Spec Reference

**Nyx feel bar (MUST match):**

> **In transcript** — failed/timeout wake = one compact error row in the thread (same message rhythm, not a toast): lucide `AlertCircle` + short reason ("Wake failed" / "Timed out") + muted agent name. No emoji, no banner strip, no retry toolbar sprawl.

> **Density** — same gap as messages; sits where the reply would have been. Optional quiet `Retry` text button inline (secondary, not primary Send).

> **Backpressure** — if wakes are queued/throttled: muted one-liner under composer or on the thinking row ("Waiting…"), not a progress dashboard.

> **Anti** — toast stacks, Slack incident cards, red full-width alerts, emoji status.

**Status:** ✅ Implemented as specified

---

## Build Output

```
> bot-os@0.1.0 build:renderer
> vite build

vite v5.4.21 building for production...
transforming...
✓ 1857 modules transformed.
rendering chunks...
computing gzip size...
../../dist/renderer/index.html                   0.39 kB │ gzip:  0.27 kB
../../dist/renderer/assets/index-BQXrpfBa.css   23.31 kB │ gzip:  4.27 kB
../../dist/renderer/assets/index-CBNBeXvG.js   176.89 kB │ gzip: 54.48 kB
✓ built in 983ms
```

**Status:** ✅ Build successful

---

## Type-Check Output

```
> bot-os@0.1.0 type-check
> tsc --noEmit

(no output - passed)
```

**Status:** ✅ Type-check passed

---

## Next Steps

1. Create PR as DRAFT
2. Run manual verification (`npm start`)
3. Capture screenshots
4. Update this NOTES file with manual test results
5. Mark PR ready for review (undraft)
6. Merge to main

---

**Verification Status:** ⏳ Awaiting manual launch testing  
**Ready for PR:** ✅ Yes (as DRAFT)  
**Ready to merge:** ❌ No (needs manual verification)
