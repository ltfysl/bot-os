# BotOS MiniMax Provider - QA Walkthrough

## Overview
This PR implements a **real third-party AI provider** (MiniMax) that makes actual HTTP API calls while maintaining complete secret safety — API keys never reach the renderer process.

## Quick Start

### Prerequisites
```bash
# Clone and checkout branch
git checkout cursor/minimax-provider-733c

# Install dependencies
npm install

# Build the app
npm run build
```

## Test Scenario 1: Without Secret (Expected Behavior)

### Steps
```bash
# Run without setting API key
npm start
```

### Expected Observations
1. **No Crashes**: App starts normally
2. **Provider Listed**: MiniMax appears in provider registry
3. **Shows Unavailable**: `hasSecret: false`, `isAvailable: false`
4. **UI Behavior**:
   - Can see MiniMax in provider list (via future ⚙ menu or agent assignment)
   - If attempting to send message, clear error: "Provider not available"
   - No API call attempts

### Verification Commands
```bash
# Check provider status programmatically
node test-minimax.js

# Expected output:
# Provider ID: minimax
# Is Available: false
# ✓ Provider correctly reports unavailable when no secret is present
```

## Test Scenario 2: With Secret (Real API Calls)

### Steps
```bash
# Set API key (get from https://platform.minimax.io/)
export MINIMAX_APIKEY=your_actual_api_key_here

# Start app
npm start
```

### Expected Observations
1. **Provider Available**: `hasSecret: true`, `isAvailable: true`
2. **Real API Calls**: Messages to MiniMax agent trigger actual HTTP requests
3. **Responses**: Get real AI-generated content back
4. **Wake/Fan-out**: Mentioning @MiniMax in another agent's chat works
5. **No Key Leaks**: 
   - Open DevTools → Network tab → No API key visible
   - Console logs → No key printed
   - IPC messages → Only `{ id, name, hasSecret: true, isAvailable: true }`

### Verification Commands
```bash
# Test provider with API key
MINIMAX_APIKEY=your_key node test-minimax.js

# Expected output:
# Provider ID: minimax
# Is Available: true
# --- Attempting real API call ---
# ✓ API call successful!
# Response: <actual AI response>
```

## Security Verification

### Manual Checks
1. **DevTools Network Tab**:
   - Filter by `minimax.io`
   - Should see NO requests (fetch happens in main process)

2. **DevTools Console**:
   - Type: `window.electronAPI`
   - Verify: No `getSecret` or similar functions exposed

3. **IPC Messages** (in main process console):
   - Should only see: `{ id: 'minimax', name: 'MiniMax', hasSecret: boolean, isAvailable: boolean }`
   - Never: `apiKey` field or actual key value

### Automated Verification
```bash
# No secrets in renderer code
grep -r "apiKey\|APIKEY" src/renderer/
# Expected: No matches found

# Only metadata in preload
grep "Secret" src/main/preload.ts  
# Expected: Only "hasSecret: boolean"

# Type safety
npm run type-check
# Expected: No errors

# Build success
npm run build
# Expected: Clean build
```

## Provider Integration Points

### 1. AgentBus Registry (from PR #3)
```typescript
// Provider auto-registers at startup
agentBus = new AgentBus({
  providers: [
    new MockEchoProvider(),
    new MockIntelligentProvider(),
    new MiniMaxProvider(),  // ← Added here
  ],
});
```

### 2. Agent Assignment
```typescript
// Agents can be assigned to MiniMax
agentBus.updateAgentProvider('agent-id', 'minimax');
```

### 3. Message Routing
```typescript
// Messages route through provider
await agentBus.sendMessage('Hello!', 'agent-id');
// ↓ Routes to MiniMax if agent.providerId === 'minimax'
```

### 4. Wake/Fan-out (from PR #4)
```typescript
// Mention @MiniMax in another agent's chat
// System auto-wakes MiniMax agent for response
await agentBus.sendMessageWithWake('Hey @MiniMax check this', 'other-agent-id');
```

## API Details

### Endpoint
- **Base URL**: `https://api.minimax.io/v1/text/chatcompletion_v2`
- **Auth**: Bearer token (API key in header)
- **Model**: `MiniMax-Text-01`

### Request Format
```json
{
  "model": "MiniMax-Text-01",
  "messages": [
    { "role": "system", "name": "Assistant", "content": "..." },
    { "role": "user", "name": "User", "content": "..." }
  ],
  "temperature": 0.9,
  "top_p": 0.95,
  "max_completion_tokens": 512
}
```

### Response Format
```json
{
  "id": "...",
  "choices": [
    { "message": { "content": "AI response here" } }
  ],
  "base_resp": { "status_code": 0 }
}
```

## Files Changed

### Core Implementation
- `src/main/providers/minimax-provider.ts` — Real API integration
- `src/main/agent-bus.ts` — Secret detection logic

### Documentation
- `README.md` — User configuration guide
- `PROVIDERS.md` — Developer integration guide (adding new providers)
- `SECURITY_VERIFICATION.md` — Security audit report

### Testing
- `test-minimax.js` — Manual verification script

## Common Issues & Solutions

### Issue: "MiniMax API key not configured"
**Solution**: Set `MINIMAX_APIKEY` environment variable before starting

### Issue: API returns 401 Unauthorized
**Solution**: Check API key is valid at https://platform.minimax.io/

### Issue: API returns 429 Rate Limited
**Solution**: Wait a moment and retry (provider includes error message)

### Issue: Provider not showing up
**Solution**: 
1. Check `npm run build` succeeded
2. Verify provider registered in `src/main/main.ts`
3. Restart app

## Next Steps

### For Adding More Providers (OpenAI, Anthropic, Z.ai)
See **PROVIDERS.md** for complete guide:
1. Create provider file: `src/main/providers/your-provider.ts`
2. Implement `AgentProvider` interface
3. Register in `src/main/main.ts`
4. Update secret detection in `agent-bus.ts`
5. Document in README.md

### For UI Polish
- Provider switcher UI (issue #5)
- Secret management UI card
- Provider settings panel

### For Feature Enhancements
- Streaming responses
- Usage tracking
- Rate limit handling
- Multi-model support per provider

## Success Criteria

- [x] `npm run type-check` passes
- [x] `npm run build` succeeds
- [x] Provider listed without secret
- [x] Provider unavailable without secret
- [x] Provider available with valid secret
- [x] Real API calls return content
- [x] No API key in DevTools Network tab
- [x] No API key in IPC messages
- [x] No API key in renderer code
- [x] Documentation complete
- [x] Verification script works

## Review Checklist for Remy

1. ✅ **Architecture**: Provider follows `AgentProvider` interface
2. ✅ **Security**: No secrets leak to renderer (see SECURITY_VERIFICATION.md)
3. ✅ **Integration**: Works with existing AgentBus from PR #3
4. ✅ **Wake/Fan-out**: Compatible with PR #4 mention system
5. ✅ **Error Handling**: Graceful failures, clear messages
6. ✅ **Documentation**: README + PROVIDERS.md + security report
7. ✅ **Testing**: Manual verification script included
8. ✅ **Type Safety**: Full TypeScript, no `any` types
9. ✅ **Build**: Clean builds for main + renderer
10. ✅ **Future-Ready**: PROVIDERS.md guides next integrations

---

**PR Ready**: https://github.com/ltfysl/bot-os/pull/6

**Branch**: `cursor/minimax-provider-733c`
