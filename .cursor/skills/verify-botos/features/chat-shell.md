# Chat Shell Verification

## Feature Overview

The chat shell is the core message interface where users interact with individual agents. It includes the message composer, transcript display, and real-time response handling.

## Critical Paths

### Path 1: Send Message to Agent

**When to verify:** Any changes to ChatView, MessageComposer, MessageList, or agent-bus message routing

**Steps:**
1. Launch app and select an agent from sidebar
2. Type a message in the composer
3. Press Enter to send
4. Observe user message appears immediately
5. Wait for assistant response
6. Verify response appears with correct agent avatar

**Expected behavior:**
- User message shows instantly with timestamp
- "Thinking..." indicator appears while waiting
- Assistant response arrives within 3-5 seconds (mock provider)
- Transcript auto-scrolls to latest message
- Composer clears and refocuses after send

**Evidence:**
- Screenshot: `chat-send-flow.png`
- Console: No errors related to IPC or message handling

### Path 2: Composer Behavior

**When to verify:** Changes to MessageComposer component

**Steps:**
1. Type a short message (< 40 chars)
2. Note textarea height
3. Type a long message with multiple lines
4. Observe textarea expansion
5. Press Shift+Enter to add newlines
6. Press Enter alone to send
7. Verify empty composer disables send button

**Expected behavior:**
- Textarea expands smoothly with content (max 5 lines visible)
- Shift+Enter creates newline without sending
- Enter alone sends message
- Send button disabled when empty or only whitespace
- Placeholder text visible when empty

**Evidence:**
- Screenshot: `composer-expand.png`
- Screenshot: `composer-empty-disabled.png`

### Path 3: Channel/Agent Switching

**When to verify:** Changes to Sidebar, App routing, or agent state management

**Steps:**
1. Send a message to Agent 1
2. Click Agent 2 in sidebar
3. Verify transcript switches to Agent 2's conversation
4. Send a message to Agent 2
5. Switch back to Agent 1
6. Verify Agent 1's transcript intact (including previous message)

**Expected behavior:**
- Each agent maintains separate message history
- Switching is instant (no loading state)
- Seed messages appear for agents without history
- Agent name and status shown in header

**Evidence:**
- Screenshot: `agent-switch-1.png` (Agent 1 view)
- Screenshot: `agent-switch-2.png` (Agent 2 view)

### Path 4: Empty State

**When to verify:** Changes to initial app state or agent rendering

**Steps:**
1. Launch app
2. Observe sidebar with no agent selected
3. Verify empty state displayed in main content area

**Expected behavior:**
- Empty state shows robot icon, title, description
- Instructions: "Select an agent from the sidebar"
- No crashes or console errors

**Evidence:**
- Screenshot: `empty-state.png`

### Path 5: Error Handling

**When to verify:** Changes to message sending or provider error paths

**Steps:**
1. Use a mock scenario that forces an error (optional: temporarily break provider)
2. Send a message
3. Observe error message in transcript

**Expected behavior:**
- Error message shows in red or with error styling
- Message content: "Failed to send message: [error details]"
- App remains functional (can retry)

**Evidence:**
- Screenshot: `error-message.png`
- Console: Error logged but app doesn't crash

## Edge Cases to Test

- **Rapid send**: Type and send multiple messages quickly (< 1 sec apart)
- **Long message**: 500+ characters
- **Special characters**: Emojis, code backticks, @ mentions (in single-agent chat)
- **Whitespace**: Leading/trailing spaces trimmed
- **Network delay**: Verify "Thinking..." indicator during slow responses

## Regression Checks

If you've changed code outside chat but want to verify you didn't break chat:

- [ ] Send one message to each agent
- [ ] Switch between agents
- [ ] Verify composer works
- [ ] Check console for errors

## Related Components

- `src/renderer/components/ChatView.tsx`
- `src/renderer/components/MessageComposer.tsx`
- `src/renderer/components/MessageList.tsx`
- `src/main/agent-bus.ts` (message routing)
- `src/main/preload.ts` (IPC bridge for `sendMessage`)

## IPC Calls Used

- `window.electronAPI.sendMessage(agentId, content)` → `Promise<Message>`
- `window.electronAPI.onWakeResponse(callback)` (for multi-agent wake)
