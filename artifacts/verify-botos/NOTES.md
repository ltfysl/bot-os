# Gemini Provider Implementation Notes

## Technical Decisions

### 1. OpenAI-Compatible Endpoint Choice

**Decision:** Use Google's OpenAI-compatible endpoint rather than the native Gemini API.

**Rationale:**
- Matches the pattern established by other providers (OpenAI, Anthropic use similar request/response structures)
- Reduces implementation complexity
- Easier to maintain consistency across providers
- Well-documented and stable endpoint
- Supports streaming via SSE (server-sent events)

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`

**Alternative considered:** Native Gemini REST API (`/v1beta/models/{model}:generateContent`)
- Would require different request format
- Different response parsing
- Less consistent with existing provider patterns

### 2. Default Model Selection

**Selected:** `gemini-2.0-flash`

**Rationale:**
- Latest stable Flash model (as of 2026)
- Faster response times suitable for chat
- Cost-effective
- Good balance of quality and speed

**Other options:**
- `gemini-2.0-pro` - Higher quality but slower
- `gemini-1.5-flash` - Previous generation
- `gemini-3.5-flash` or `gemini-3.8-flash` - If available

### 3. Streaming Implementation

**Approach:** Server-Sent Events (SSE) parsing

**Implementation details:**
```typescript
// Request includes stream: true
{ stream: true, model: "...", messages: [...] }

// Response format:
data: {"choices":[{"delta":{"content":"chunk"}}]}
data: [DONE]
```

**Key challenges handled:**
1. Buffer management for partial chunks
2. Line splitting on `\n`
3. Filtering `data:` prefix
4. Handling `[DONE]` sentinel
5. JSON parsing per chunk with error handling
6. Final callback with full content

### 4. Environment Variable Support

**Primary:** `GEMINI_API_KEY`  
**Alternative:** `GEMINI_APIKEY` (via secrets.ts normalization)

**Pattern matches OpenAI:**
- Checked in multiple places (isAvailable, hasSecret, sendMessage)
- Provides fallback if no stored secret exists
- Allows easy local development without UI configuration

### 5. Error Handling Strategy

**Three-tier approach:**

1. **Network/HTTP errors** - `response.ok` check
   ```typescript
   if (!response.ok) {
     throw new Error(`Gemini API error ${response.status}: ${errorText}`);
   }
   ```

2. **Service-level errors** - API response includes error object
   ```typescript
   if (data.error) {
     throw new Error(`Gemini service error: ${data.error.message}`);
   }
   ```

3. **Response validation** - Empty or malformed responses
   ```typescript
   if (!content) {
     throw new Error('Gemini returned empty response');
   }
   ```

### 6. Token Limits

**max_completion_tokens: 512**

**Rationale:**
- Matches OpenAI provider setting
- Appropriate for chat interface (short-form responses)
- Prevents overly verbose responses
- Keeps response latency low

**Override:** Can be adjusted in config or via future UI settings

## Code Patterns

### Secret Resolution Chain

```typescript
const apiKey = 
  this.config.apiKey ||                        // 1. Explicit config
  getProviderSecret('gemini', 'apiKey') ||     // 2. Stored secret
  process.env.GEMINI_API_KEY;                  // 3. Environment variable
```

**Order matters:**
1. Explicit config (testing, custom setups)
2. Stored secret (user-entered via UI)
3. Environment variable (development, deployment)

### TypeScript Interface Design

```typescript
interface GeminiConfig {
  apiKey?: string;      // Optional override
  model?: string;       // Optional model selection
  baseUrl?: string;     // Optional endpoint override
}
```

All fields optional to allow:
- Zero-config instantiation
- Flexible overrides
- Default values

### Streaming Callback Pattern

```typescript
async sendMessageStream(
  message: string,
  context: Record<string, unknown> | undefined,
  onChunk: StreamChunkCallback
): Promise<void>
```

**Callback signature:** `(chunk: string, done: boolean) => void`

**Usage:**
- `onChunk(partialContent, false)` - Incremental updates
- `onChunk(fullContent, true)` - Final complete response

## Security Considerations

### 1. Secret Isolation

✅ **Main process only:**
- All API calls happen in main process
- Renderer never receives actual keys
- IPC returns metadata only

✅ **Encryption at rest:**
- Stored secrets use Electron's `safeStorage`
- Platform-specific encryption (Keychain/Credential Manager/Secret Service)

### 2. No Key Logging

✅ **Verified no console.log with keys:**
- No debug output includes API keys
- Error messages don't include auth headers
- Request logging disabled in production

### 3. IPC Boundary

✅ **Safe data structures:**
```typescript
interface ProviderInfo {
  id: string;
  name: string;
  hasSecret: boolean;      // ✅ Boolean only
  isAvailable: boolean;    // ✅ Boolean only
}
```

Never:
```typescript
// ❌ Don't do this
interface ProviderInfo {
  apiKey?: string;  // ❌ Never expose keys to renderer
}
```

## Testing Notes

### Type Safety Validation

```bash
$ npm run type-check
# Validates:
# - Interface implementations
# - Method signatures
# - Return types
# - Import/export correctness
```

### Build Process Validation

```bash
$ npm run build
# Validates:
# - TypeScript compilation
# - Vite bundling
# - Output file generation
# - No runtime errors in module resolution
```

### Manual Testing Checklist

**Pre-requisites:**
- Get a Gemini API key from Google AI Studio
- Either set `GEMINI_API_KEY` env var or use UI

**Test cases:**

1. **Provider Registration**
   - [ ] Gemini appears in provider list
   - [ ] Shows unavailable without key
   - [ ] Shows available with key

2. **Message Sending (Non-Stream)**
   - [ ] Send simple message
   - [ ] Receive response
   - [ ] No errors in console

3. **Message Sending (Stream)**
   - [ ] Send longer message
   - [ ] See chunks arrive progressively
   - [ ] Complete message appears
   - [ ] No errors in console

4. **Error Handling**
   - [ ] Invalid API key shows error
   - [ ] Network failure handled gracefully
   - [ ] Empty response handled

5. **Secret Management**
   - [ ] Can enter key via UI
   - [ ] Provider becomes available
   - [ ] Key persists across restarts
   - [ ] Can clear key
   - [ ] Provider becomes unavailable

## Integration Points

### Files Modified

1. **src/main/providers/gemini-provider.ts** (NEW)
   - Provider implementation
   - ~220 lines
   - Implements AgentProvider interface

2. **src/main/main.ts**
   - Added import: `import { GeminiProvider } from './providers/gemini-provider';`
   - Added to providers array: `new GeminiProvider()`

3. **src/main/agent-bus.ts**
   - Added to `providerHasSecret()` method
   - Checks both stored secret and env var

### No Changes Required To

- Renderer code (UI automatically picks up new provider)
- IPC handlers (existing handlers work)
- Secret management (existing system works)
- Type definitions (AgentProvider interface unchanged)

## Future Enhancements

### Optional Improvements (Out of Scope)

1. **Function Calling**
   - Gemini supports tools/function calling
   - Would require extending AgentProvider interface
   - Coordinated change across all providers

2. **Model Selection UI**
   - Allow users to choose model per agent
   - Would require UI changes
   - Provider already supports via config

3. **Token Usage Tracking**
   - Response includes `usage` object
   - Could display token counts
   - Would require UI changes

4. **Multi-modal Support**
   - Gemini supports images
   - Would require file upload handling
   - Message format extension needed

5. **Caching**
   - Gemini supports context caching
   - Could improve performance
   - Requires cache management logic

## References

- **Google Gemini API Docs:** https://ai.google.dev/gemini-api/docs
- **OpenAI Compatibility:** https://ai.google.dev/gemini-api/docs/openai
- **BotOS PROVIDERS.md:** /workspace/PROVIDERS.md
- **OpenAI Provider:** /workspace/src/main/providers/openai-provider.ts
- **Anthropic Provider:** /workspace/src/main/providers/anthropic-provider.ts

## Verification Commands

```bash
# Type checking
npm run type-check

# Build
npm run build

# Run app (requires valid API key for testing)
export GEMINI_API_KEY=your_key_here
npm start

# Check for the provider in logs
npm start | grep -i gemini
```
