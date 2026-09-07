# Token Streaming Chrome Verification

**Branch:** `cursor/token-stream-chrome-5220`  
**Depends on:** PR #30 (bus-depth streaming IPC)  
**Date:** 2026-09-07

## Overview

This PR implements desktop UI chrome for token streaming in BotOS, wiring the renderer to the existing streaming IPC seam established in PR #30. The implementation follows Nyx feel specifications for in-place message growth with a CSS caret and quiet stop control.

## Implementation Details

### 1. ChatView Streaming Wiring

**File:** `src/renderer/components/ChatView.tsx`

- Added `streamingMessage` state to track in-flight assistant response
- Added `onMessageStreamChunk` listener that accumulates chunks into a single growing message
- Switched from `sendMessage` to `sendMessageStream` IPC call
- Added `handleStopStreaming` to finalize partial streaming messages
- Pass `streamingMessage` and `isStreaming` props to child components

**Key Logic:**
```typescript
useEffect(() => {
  const unsubscribe = window.electronAPI.onMessageStreamChunk((chunk: StreamChunk) => {
    if (chunk.targetAgentId === agent?.id) {
      if (!chunk.done) {
        // Accumulate chunks into growing message
        setStreamingMessage((prev) => {
          if (prev && prev.id === chunk.id) {
            return { ...prev, content: prev.content + chunk.chunk };
          } else {
            // First chunk - create new streaming message
            return {
              id: chunk.id,
              content: chunk.chunk,
              role: 'assistant',
              timestamp: Date.now(),
              agentId: chunk.agentId,
              agentName: chunk.agentName,
              agentAvatar: chunk.agentAvatar,
              isStreaming: true,
            };
          }
        });
      } else {
        // Final chunk - move to messages array
        setStreamingMessage((prev) => {
          if (prev && prev.id === chunk.id) {
            const finalMessage: Message = {
              id: prev.id,
              content: prev.content + chunk.chunk,
              role: prev.role,
              timestamp: prev.timestamp,
              agentId: prev.agentId,
              agentName: prev.agentName,
              agentAvatar: prev.agentAvatar,
            };
            setMessages((msgs) => [...msgs, finalMessage]);
            return null;
          }
          return prev;
        });
        setIsLoading(false);
      }
    }
  });
  return () => unsubscribe();
}, [agent?.id]);
```

### 2. RoomView Streaming Wiring

**File:** `src/renderer/components/RoomView.tsx`

- Added `streamingMessage` state for room message streaming
- Added `onRoomStreamChunk` listener with same accumulation pattern
- Switched from `sendRoomMessage` to `sendRoomMessageStream` IPC call
- Added `handleStopStreaming` for room contexts
- Convert room streaming message to generic format for MessageList

**Key Differences from ChatView:**
- Room messages include `roomId` field
- Must handle multi-agent fan-in scenarios
- Converts `StreamingRoomMessage` to generic streaming format for MessageList

### 3. MessageList Streaming Display

**File:** `src/renderer/components/MessageList.tsx`

- Added `streamingMessage` optional prop
- Render streaming message as distinct bubble with CSS caret
- Keep attribution (name/avatar) fixed at top while content grows
- Updated empty state check to include `!streamingMessage`
- Updated scroll effect dependencies to include `streamingMessage`

**Streaming Message Render:**
```typescript
{streamingMessage && (
  <div className="message assistant">
    <div className="message-avatar">
      {renderAvatar('assistant', streamingMessage.agentAvatar)}
    </div>
    <div className="message-content">
      <div className="message-header">
        <span className="message-author">
          {streamingMessage.agentName || 'Assistant'}
        </span>
      </div>
      <div className="message-text streaming">
        {parseInlineCode(streamingMessage.content)}
        <span className="streaming-caret"></span>
      </div>
    </div>
  </div>
)}
```

### 4. MessageComposer Stop Control

**File:** `src/renderer/components/MessageComposer.tsx`

- Added `onStop` callback prop
- Added `isStreaming` boolean prop
- Conditionally render Stop button (lucide `Square` icon) when streaming
- Stop button replaces Send button during active stream
- Quiet styling matching Nyx specs (28px, text-tertiary, hover bg)

**Stop Button:**
```typescript
{isStreaming && onStop ? (
  <button
    className="compose-stop"
    onClick={onStop}
    title="Stop streaming"
  >
    <Square size={14} strokeWidth={2} fill="currentColor" />
  </button>
) : (
  <button
    className="compose-send"
    onClick={handleSend}
    disabled={!message.trim() || disabled}
  >
    Send
  </button>
)}
```

### 5. CSS Streaming Chrome

**File:** `src/renderer/index.css`

Added two new style blocks:

**Streaming Caret (CSS blink animation):**
```css
.message-text.streaming {
  position: relative;
}

.streaming-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background: var(--text-primary);
  animation: blink 1s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}
```

**Stop Button:**
```css
.compose-stop {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-radius: 4px;
  transition: background 0.1s ease, color 0.1s ease;
}

.compose-stop:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.compose-stop:active {
  background: var(--bg-active);
}
```

## Nyx Feel Compliance

✅ **In-place growth:** Single assistant bubble accumulates chunks; attribution fixed at top  
✅ **Caret:** CSS-based blinking caret (`streaming-caret` span) using `@keyframes blink`  
✅ **Density:** Same 4–5px chat rhythm; no extra padding for streaming mode  
✅ **Stop:** Quiet lucide Square icon (28px, text-tertiary) near composer during stream  
✅ **Anti-patterns avoided:** No typewriter rainbow, no chunk-as-messages, no Slack banners, no emoji spinners

## Type Safety

- Created consistent `StreamingMessage` interface across components
- Defined with explicit `role: 'assistant'` (not union type)
- Properly typed stream chunk handlers in both ChatView and RoomView
- MessageList accepts optional `streamingMessage` prop

## Build Verification

```
npm run type-check  ✅ PASS
npm run build       ✅ PASS
```

**Build Output:**
```
../../dist/renderer/index.html                   0.39 kB │ gzip:  0.27 kB
../../dist/renderer/assets/index-CyeoxfZv.css   22.74 kB │ gzip:  4.18 kB
../../dist/renderer/assets/index-D5cUwreZ.js   172.56 kB │ gzip: 53.67 kB
✓ built in 868ms
```

## Manual Testing Notes

### Test Coverage Needed

**1:1 Chat Streaming:**
- [ ] Send message to agent with streaming provider
- [ ] Verify single bubble grows in place with caret
- [ ] Verify attribution (name/avatar) stays fixed
- [ ] Click Stop button mid-stream
- [ ] Verify partial message finalizes on stop
- [ ] Verify caret disappears on complete

**Room Streaming:**
- [ ] Send @mention in room to trigger stream
- [ ] Verify room streaming bubble behavior
- [ ] Verify Stop button works in room context
- [ ] Verify multi-agent fan-in doesn't break streaming

**Edge Cases:**
- [ ] Rapid message sends (queue handling)
- [ ] Stop before first chunk arrives
- [ ] Network failure during stream
- [ ] Empty stream chunks
- [ ] Very long streaming messages (scroll behavior)

### Known Limitations

1. **No abort signal:** Stop button finalizes message but doesn't cancel server-side stream
2. **No retry:** Failed streams show error; no auto-retry
3. **No progress indicator:** Only caret shows activity (no byte count, no ETA)
4. **Widget interaction:** Streaming doesn't block widget requests (by design)

## Architecture Notes

### IPC Boundary

This PR operates **entirely above the IPC seam**. It does not:
- Modify `AgentBus` or provider streaming logic
- Change IPC event signatures
- Add new IPC methods
- Touch main process streaming implementation

It only:
- Listens to existing `message-stream-chunk` and `room-stream-chunk` events
- Calls existing `sendMessageStream` and `sendRoomMessageStream` IPC methods

### State Management

- Streaming message kept separate from messages array during stream
- Moved to messages array only on `done: true` chunk or manual stop
- Loading state (`isLoading`) distinct from streaming state (`!!streamingMessage`)
- Neutral "…" chrome shown when `isLoading && !streamingMessage`

### Scroll Behavior

- `messagesEndRef` updated to depend on both `messages` and `streamingMessage`
- Auto-scrolls as streaming content grows
- Smooth scroll behavior maintained

## Diff Summary

**Files Modified:**
- `src/renderer/components/ChatView.tsx` (+90 lines)
- `src/renderer/components/RoomView.tsx` (+85 lines)
- `src/renderer/components/MessageList.tsx` (+35 lines)
- `src/renderer/components/MessageComposer.tsx` (+20 lines)
- `src/renderer/index.css` (+45 lines)

**No Files Created**

**Total:** +275 lines, desktop UI only

## Remaining Work

- [ ] Manual verification against mock/streaming provider
- [ ] Screenshot capture in `artifacts/verify-botos/screenshots/`
- [ ] Undraft PR after verification complete

## Success Criteria

✅ Type-check passes  
✅ Build passes  
✅ Streaming wired to IPC seam (no provider reimplementation)  
✅ In-place bubble growth with CSS caret  
✅ Quiet Stop control near composer  
✅ Same 4–5px density (no streaming-mode padding)  
⏳ Manual verification pending  
⏳ PR undraft pending verification
