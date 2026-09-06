# Anthropic Provider Verification

## Summary
Added Anthropic Claude as a new AgentProvider following the same pattern as MiniMax, Z.ai, and CodingPlan providers.

## Implementation Details

### Provider Configuration
- **Provider ID**: `anthropic`
- **Provider Name**: `Anthropic Claude`
- **Default Model**: `claude-sonnet-4-20250514`
- **API Endpoint**: `https://api.anthropic.com/v1/messages`
- **Optional Base URL Override**: `ANTHROPIC_BASE_URL` environment variable

### Secret Management
- **Secret Key**: `apiKey` via `ANTHROPIC_APIKEY` environment variable
- Uses write-only secret pattern via `setProviderSecret` / `hasProviderSecret` / `getProviderSecret`
- Main process only (no renderer access to secrets)
- Properly wired into `providerHasSecret` method in `agent-bus.ts`

### Security Verification
✅ **No Context Leak**: HTTP request body contains only `messages`, `model`, `max_tokens`, and `temperature` parameters
✅ **No Context Spread**: Wake/routine/room context is NOT spread into the request body
✅ **Secret Safety**: API key only accessed in main process via secure pattern

### Build Verification
```bash
✅ npm run build:main - SUCCESS
✅ npm run build - SUCCESS
✅ TypeScript compilation - NO ERRORS
```

### Integration Points
1. **Provider Registration**: Added to `AgentBus` constructor in `main.ts` alongside other providers
2. **Secret Detection**: Wired into `providerHasSecret` method for `listProviders` hasSecret flag
3. **Documentation**: README updated with ANTHROPIC_APIKEY setup instructions and Anthropic Console link

## Code Quality

### Pattern Consistency
- Follows exact same structure as `MiniMaxProvider`, `ZaiProvider`, and `CodingPlanProvider`
- Implements `AgentProvider` interface completely
- Uses proper TypeScript types for request/response
- Error handling matches established patterns

### Request Structure
```typescript
{
  model: this.config.model,
  messages: [{ role: 'user', content: message }],
  max_tokens: 2048,
  temperature: 0.7
}
```

### Headers
```typescript
{
  'Content-Type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01'
}
```

## Testing Notes

### Manual Verification Steps
To verify the provider works correctly:

1. Set API key: `export ANTHROPIC_APIKEY=your_key_here`
2. Start app: `npm start`
3. Check provider list shows Anthropic with `hasSecret: true` and `isAvailable: true`
4. Assign an agent to use the Anthropic provider
5. Send a message to that agent
6. Verify response comes from Claude

### Expected Behavior
- Provider appears in list when no key is set (hasSecret: false, isAvailable: false)
- Provider becomes available when ANTHROPIC_APIKEY is set
- Messages are properly formatted for Anthropic Messages API
- Responses are correctly extracted from content array
- Errors are properly handled and reported

## Files Changed
- **New**: `src/main/providers/anthropic-provider.ts` - Provider implementation
- **Modified**: `src/main/main.ts` - Import and register AnthropicProvider
- **Modified**: `src/main/agent-bus.ts` - Add anthropic to providerHasSecret
- **Modified**: `README.md` - Document ANTHROPIC_APIKEY and provider

## Commit
```
feat: add Anthropic Claude provider with secret-safe pattern

- New AnthropicProvider implementing AgentProvider interface
- Provider id: anthropic, name: Anthropic Claude
- Secret: apiKey via ANTHROPIC_APIKEY env var
- Optional ANTHROPIC_BASE_URL override support
- Default model: claude-sonnet-4-20250514
- Register in AgentBus alongside MiniMax/Z.ai providers
- Wire providerHasSecret for anthropic in agent-bus
- HTTP body: messages/model/params only (no context leak)
- README: document ANTHROPIC_APIKEY + provider setup
```

## Status
✅ **TypeScript Compilation**: Green
✅ **Build**: Green  
✅ **Pattern Compliance**: Matches existing providers
✅ **Secret Safety**: No leaks, main-only access
✅ **Documentation**: Complete
✅ **Ready for Review**: Yes (as draft PR)
