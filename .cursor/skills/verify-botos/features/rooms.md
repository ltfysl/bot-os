# Rooms Verification

## Feature Overview

Rooms enable multi-agent coordination. Users send messages to a room, and can @-mention agents to "wake" them for responses. Rooms have member lists and fan-in/fan-out message routing.

## Critical Paths

### Path 1: Room Creation and Navigation

**When to verify:** Changes to Sidebar room switcher, RoomManager, or room persistence

**Steps:**
1. Launch app
2. Click "Rooms" in sidebar
3. Create a new room with 2+ member agents
4. Verify room appears in sidebar
5. Click room to open
6. Verify room header shows room name and member avatars

**Expected behavior:**
- Room creation UI appears when clicked
- New room saved immediately (persists across app restart)
- Room shown in sidebar with name
- Room header displays up to 4 member avatars
- Overflow count shown if > 4 members (e.g., "+2")

**Evidence:**
- Screenshot: `room-create.png`
- Screenshot: `room-header.png`

### Path 2: Basic Room Messaging (No Wake)

**When to verify:** Changes to RoomView, room message routing, or wake-only behavior

**Steps:**
1. Open a room with 2+ members
2. Send a message without @-mentions (e.g., "Hello everyone")
3. Verify user message appears
4. Observe NO assistant responses
5. Verify NO "Thinking..." indicator

**Expected behavior:**
- User message shows immediately
- NO assistant responses (only @-mentions wake agents)
- NO loading indicator
- Message persists in room transcript
- Composer clears and refocuses

**Evidence:**
- Screenshot: `room-bare-send-no-response.png`

### Path 3: @-Mention Wake

**When to verify:** Changes to @-mention extraction, agent wake logic, or fan-in responses

**Steps:**
1. Open a room with agents named "Dash", "Research", "Code"
2. Send message: "Hey @Dash and @Research, what do you think?"
3. Observe "Thinking..." indicator appears
4. Wait for responses (up to 30s timeout)
5. Verify 2 responses appear (one from each @-mentioned agent)
6. Each response shows different agent name/avatar

**Expected behavior:**
- "Thinking..." indicator visible after send
- Only @-mentioned agents respond (Dash and Research in this example)
- Wake responses arrive within 5 seconds
- Each response tagged with correct agent name/avatar
- Loading indicator clears after all responses received

**Evidence:**
- Screenshot: `room-mention-send.png` (message with @-mentions)
- Screenshot: `room-mention-responses.png` (multiple agent responses)
- Console: No errors from `sendRoomMessage` or wake callbacks

### Path 4: Room Member Avatars

**When to verify:** Changes to room header, member list display, or agent metadata

**Steps:**
1. Create room with 3 members
2. Verify 3 avatars displayed
3. Create room with 6 members
4. Verify 4 avatars + "+2" overflow count

**Expected behavior:**
- Up to 4 avatars shown as circles
- Overflow count (if > 4) displayed as "+N"
- Hovering avatars shows agent name in tooltip

**Evidence:**
- Screenshot: `room-members-few.png` (≤4 members)
- Screenshot: `room-members-many.png` (>4 members)

### Path 5: Room Persistence and Unread

**When to verify:** Changes to RoomManager persistence, unread tracking, or room state

**Steps:**
1. Create a new room
2. Send 2 messages
3. Switch to another room or agent
4. Close app (Cmd/Ctrl + Q)
5. Relaunch app
6. Navigate back to original room
7. Verify messages persisted

**Expected behavior:**
- Room list saved to `userData/rooms/rooms.json`
- Messages saved to `userData/rooms/messages.json`
- Unread count increments when room receives message while not active
- Unread clears when room is opened

**Evidence:**
- Screenshot: `room-unread.png` (unread count badge)
- Console: Check logs for room save/load

### Path 6: Empty Room State

**When to verify:** Changes to RoomView empty state rendering

**Steps:**
1. Create a new room
2. Open it before sending any messages
3. Verify "No messages yet" empty state

**Expected behavior:**
- Empty state message displayed
- No crashes or missing UI elements
- Composer still visible and functional

**Evidence:**
- Screenshot: `room-empty.png`

## Edge Cases to Test

- **Case mismatch**: `@dash` vs `@Dash` (should both wake agent named "Dash")
- **Multiple mentions**: `@Agent1 @Agent2 @Agent1` (should wake Agent1 once)
- **Self-mention**: Mention agent not in room (should be ignored)
- **Timeout**: Wait 30+ seconds for wake responses (verify loading clears)

## Regression Checks

If you've changed code outside rooms but want to verify rooms still work:

- [ ] Open one room
- [ ] Send one message without @-mention (verify NO response)
- [ ] Send one message with @-mention (verify response from mentioned agent)
- [ ] Check console for errors

## Related Components

- `src/renderer/components/RoomView.tsx`
- `src/main/rooms.ts` (RoomManager)
- `src/main/agent-bus.ts` (`sendMessageWithWake`, `extractMentions`, `wakeAgent`)
- `src/main/preload.ts` (IPC: `sendRoomMessage`, `getRoomMessages`, `clearRoomUnread`)

## IPC Calls Used

- `window.electronAPI.sendRoomMessage(roomId, content)` → `Promise<RoomMessage>`
- `window.electronAPI.getRoomMessages(roomId)` → `Promise<RoomMessage[]>`
- `window.electronAPI.onRoomFanInResponse(callback)` (wake responses)
- `window.electronAPI.clearRoomUnread(roomId)` → `Promise<void>`

## Message Structure

```typescript
interface RoomMessage {
  id: string;
  roomId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
}
```

**Key fields:**
- `agentId`, `agentName`, `agentAvatar` - Set for wake responses to identify which agent spoke
- `roomId` - Used for routing fan-in responses to correct room
