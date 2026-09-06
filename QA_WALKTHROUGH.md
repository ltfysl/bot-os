# Wake/Fan-out QA Walkthrough

## Build & Run
```bash
npm install
npm run build
npm start
```

## Test 1: Primary-first (Not Blocked)
1. Select "Assistant" from sidebar
2. Type: `@Researcher what do you think?`
3. Press Enter

**Expected:**
- User message appears immediately
- Assistant response appears immediately (~500-800ms)
- Researcher response appears after (~500-800ms additional)
- No 5s wait before seeing Assistant

**Verify:**
- Primary never waits on wakes
- Each response independent timing

## Test 2: Real Agent Attribution
Same test as above.

**Expected in transcript:**
```
You: "@Researcher what do you think?"
Assistant 🤖: "On it."                    <- Primary agent identity
Researcher 📚: "Looks good."              <- Wake agent identity
```

**Verify:**
- Name in chrome header = actual agent name
- Avatar in chrome = actual agent emoji
- No `[Researcher]` prefix in content text

## Test 3: Multiple Wakes
Type: `@Coder implement this @Researcher verify it`

**Expected:**
- Assistant responds first (~500-800ms)
- Coder 💻 response appears next
- Researcher 📚 response appears after
- All with proper name + avatar in chrome

## Architecture

**Primary path:**
```
sendMessage() → primary returned → IPC → ChatView displays
```

**Wake path (concurrent):**
```
wakeAgent() → event.sender.send('wake-response') → onWakeResponse callback → append to messages
```

**No blocking:** Primary returns before wakes start racing.

## Edge Cases
- Self-mention filtered: `@Assistant` when talking to Assistant = no wake
- Invalid name ignored: `@Nonexistent` = no error, just skipped
- Timeout: Wake takes >5s = logged error, doesn't crash
