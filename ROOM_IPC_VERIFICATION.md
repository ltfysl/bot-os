# Room IPC Verification Guide

## Testing Room Operations in Dev Console

Open the Electron app dev console and test these operations:

### 1. List Available Agents
```javascript
const agents = await window.electronAPI.getAgents();
console.log('Available agents:', agents);
// Example output: [
//   { id: '1', name: 'Assistant', avatar: '🤖', ... },
//   { id: '2', name: 'Researcher', avatar: '📚', ... },
//   { id: '3', name: 'Coder', avatar: '💻', ... }
// ]
```

### 2. Create a Room
```javascript
const room = await window.electronAPI.createRoom(
  'Engineering Discussion',
  ['1', '2', '3']  // Include all three agents
);
console.log('Created room:', room);
// Output: { id: '...', name: 'Engineering Discussion', memberAgentIds: ['1','2','3'], unread: 0 }
```

### 3. List All Rooms
```javascript
const rooms = await window.electronAPI.listRooms();
console.log('All rooms:', rooms);
```

### 4. Subscribe to Fan-in Responses
```javascript
// Set up listener BEFORE sending messages
const unsubscribe = window.electronAPI.onRoomFanInResponse((message) => {
  console.log(`[FAN-IN] ${message.agentName} (${message.agentAvatar}): ${message.content}`);
});

// Later, to cleanup:
// unsubscribe();
```

### 5. Send Simple Message (no mentions)
```javascript
const userMsg = await window.electronAPI.sendRoomMessage(
  room.id,
  'Hello everyone!',
  '1'  // senderId - Assistant will respond
);
console.log('User message sent:', userMsg);
```

### 6. Send Message with @-mentions (Fan-in)
```javascript
// This will wake BOTH Researcher and Coder
const fanInMsg = await window.electronAPI.sendRoomMessage(
  room.id,
  '@Researcher and @Coder, please analyze this React component'
);

// Watch console for fan-in responses from the listener above
// You should see two responses with attribution:
// [FAN-IN] Researcher (📚): [response content]
// [FAN-IN] Coder (💻): [response content]
```

### 7. Get Room Messages
```javascript
const messages = await window.electronAPI.getRoomMessages(room.id);
console.log('Room message history:', messages);
// Shows all messages with attribution
```

### 8. Update Room (e.g., change name or members)
```javascript
const updated = await window.electronAPI.updateRoom(room.id, {
  name: 'Updated Room Name',
  memberAgentIds: ['1', '2']  // Remove Coder from room
});
console.log('Updated room:', updated);
```

### 9. Clear Unread Count
```javascript
await window.electronAPI.clearRoomUnread(room.id);
console.log('Unread cleared');
```

### 10. Delete Room
```javascript
const deleted = await window.electronAPI.deleteRoom(room.id);
console.log('Room deleted:', deleted);
```

## Expected Behavior

### @-mention Parsing
The system extracts mentions by:
1. Finding all `@AgentName` patterns in message
2. Matching agent names (case-insensitive) against `room.memberAgentIds`
3. Only agents who are members of the room can be woken

### Attribution Flow
Every assistant response includes:
```javascript
{
  agentId: '2',
  agentName: 'Researcher',
  agentAvatar: '📚',
  // ... other message fields
}
```

This enables Vale layer to show:
- Who said what in multi-agent conversations
- Agent avatars next to messages
- Room member list with avatars

### Persistence
- Rooms persist across app restarts in `{userData}/rooms/rooms.json`
- Messages persist in `{userData}/rooms/messages.json`
- On macOS: `~/Library/Application Support/bot-os/rooms/`
- On Linux: `~/.config/bot-os/rooms/`
- On Windows: `%APPDATA%/bot-os/rooms/`

## Complete Example Session

```javascript
// 1. Setup
const agents = await window.electronAPI.getAgents();
const room = await window.electronAPI.createRoom('Test Room', agents.map(a => a.id));

// 2. Subscribe to fan-in
window.electronAPI.onRoomFanInResponse((msg) => {
  console.log(`${msg.agentName}: ${msg.content}`);
});

// 3. Test @-mentions
await window.electronAPI.sendRoomMessage(
  room.id,
  '@Assistant what is the meaning of life? @Researcher please provide sources.'
);

// 4. Check history
const history = await window.electronAPI.getRoomMessages(room.id);
console.log(`Room has ${history.length} messages`);

// 5. Cleanup
await window.electronAPI.deleteRoom(room.id);
```

## Troubleshooting

### No fan-in responses?
- Check that agents are members of the room
- Verify agent names match exactly (case-insensitive)
- Ensure listener was set up before sending message

### Messages not persisting?
- Check console for file I/O errors
- Verify app has write permissions to userData directory
- Look for `rooms.json` and `messages.json` in userData path

### Provider errors?
- Check that agents have valid providers configured
- Verify secrets are set for third-party providers (MiniMax, Z.ai)
- Mock providers should always work without secrets
