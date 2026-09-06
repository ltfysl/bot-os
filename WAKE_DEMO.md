# Wake/Fan-out Coordination Demo

This document demonstrates how to test the wake/fan-out coordination feature.

## Quick Start

```bash
npm install
npm run build
npm start
```

## Testing Wake Mechanism

### 1. Basic Wake
1. Open BotOS
2. Select "Assistant" agent from the sidebar
3. Type: `@Researcher what do you think about this?`
4. Press Enter

**Expected result:**
- User message appears
- Assistant responds (e.g., "On it.")
- Researcher's response appears below, prefixed with `[Researcher]`

### 2. Multiple Wakes
Type: `@Coder implement this feature @Researcher verify it works`

**Expected result:**
- Primary agent (Assistant) responds
- Coder's response appears: `[Coder] <response>`
- Researcher's response appears: `[Researcher] <response>`

### 3. Self-mention (No Wake)
Type: `@Assistant can you help?`

**Expected result:**
- Only primary agent responds (no wake, since you're already talking to Assistant)

### 4. Non-existent Agent
Type: `@InvalidAgent do something`

**Expected result:**
- Primary agent responds normally
- No error (unmatched mentions are silently ignored)

## Implementation Details

### Wake Detection
- Uses regex pattern: `/@(\w+)/g`
- Matches against registered agent names (case-insensitive)
- Example: "Assistant", "Researcher", "Coder"

### Timeout & Concurrency
- Each woken agent has a 5-second timeout
- Wake requests run concurrently
- Primary agent response is never blocked

### Response Order
1. Primary agent response appears first
2. Wake responses appear in completion order
3. Wake responses prefixed with `[AgentName]`

## Architecture Flow

```
User sends: "@Researcher check this"
    ↓
AgentBus.sendMessageWithWake()
    ↓
extractMentions() → ["2"] (Researcher's ID)
    ↓
Promise.all([
    sendMessage(primary agent),     → "On it."
    wakeAgent("2", message, "1")    → "Looks good."
])
    ↓
Fan-in to ChatView
    ↓
Display:
    User: "@Researcher check this"
    Assistant: "On it."
    [Researcher] "Looks good."
```

## Code Locations

- **Wake logic**: `src/main/agent-bus.ts` → `sendMessageWithWake()`
- **Mention extraction**: `src/main/agent-bus.ts` → `extractMentions()`
- **IPC handler**: `src/main/main.ts` → `ipcMain.handle('send-message')`
- **Renderer integration**: `src/renderer/components/ChatView.tsx` → `handleSendMessage()`

## Edge Cases Handled

✅ Self-mentions (filtered out)  
✅ Invalid agent names (ignored)  
✅ Timeout protection (5s per wake)  
✅ Failed wakes (caught, logged, don't crash)  
✅ Concurrent wake requests (Promise.all with timeout)  
✅ Empty wake list (primary-only path)

## Future Enhancements

- Skills-based wake routing (e.g., `@skill:code-review`)
- Channel-scoped wakes (e.g., `@channel:development`)
- Wake acknowledgment UI (show "waking..." state)
- Wake history/analytics
- Configurable timeout per provider
