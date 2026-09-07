# Provider Implementation Guide

This guide explains how to add new third-party AI providers to BotOS following the established architecture.

## Architecture Overview

BotOS uses a pluggable provider system where:
1. **Secrets stay in main process only** (via `secrets.ts` or environment variables)
2. **Renderer sees metadata only** (`{ id, name, hasSecret, isAvailable }`)
3. **No keys in IPC** - the renderer never has access to API keys
4. **AgentBus routes messages** to the appropriate provider per agent

## Provider Interface

All providers must implement the `AgentProvider` interface:

```typescript
interface AgentProvider {
  id: string;              // Unique provider identifier (e.g., 'minimax', 'openai')
  name: string;            // Display name shown in UI
  sendMessage(message: string, context?: Record<string, unknown>): Promise<string>;
  isAvailable(): Promise<boolean>;
}
```

## Step-by-Step: Adding a New Provider

### 1. Create Provider File

Create `src/main/providers/your-provider.ts`:

```typescript
import type { AgentProvider } from '../agent-bus';
import { getProviderSecret } from '../secrets';

export interface YourProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  // Add any provider-specific config
}

export class YourProvider implements AgentProvider {
  readonly id = 'your-provider';  // lowercase, hyphenated
  readonly name = 'Your Provider'; // Display name

  private config: YourProviderConfig;

  constructor(config: YourProviderConfig = {}) {
    this.config = {
      model: config.model || 'default-model',
      baseUrl: config.baseUrl || 'https://api.yourprovider.com/v1',
      ...config,
    };
  }

  async sendMessage(message: string, context?: Record<string, unknown>): Promise<string> {
    // Get API key from config or secrets
    const apiKey = this.config.apiKey || getProviderSecret('your-provider', 'apiKey');

    if (!apiKey) {
      throw new Error('YourProvider API key not configured');
    }

    if (!this.config.baseUrl) {
      throw new Error('YourProvider base URL not configured');
    }

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: message }],
          // Add provider-specific parameters
          ...context,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`YourProvider API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // Extract response content (adjust to provider's response format)
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('YourProvider returned empty response');
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('YourProvider: unexpected error');
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || getProviderSecret('your-provider', 'apiKey');
    return Boolean(apiKey);
  }
}
```

### 2. Register Provider in AgentBus

Update `src/main/main.ts`:

```typescript
import { YourProvider } from './providers/your-provider';

agentBus = new AgentBus({
  providers: [
    new MockEchoProvider(),
    new MockIntelligentProvider(),
    new MiniMaxProvider(),
    new YourProvider(),  // Add here
  ],
  defaultProviderId: 'mock-intelligent',
});
```

### 3. Update Secret Detection

Update `src/main/agent-bus.ts` in the `providerHasSecret` method:

```typescript
private providerHasSecret(providerId: string): boolean {
  const provider = this.providers.get(providerId);
  if (!provider) return false;
  
  if (providerId === 'minimax') {
    const { hasProviderSecret } = require('./secrets');
    return hasProviderSecret('minimax', 'apiKey');
  }
  
  if (providerId === 'your-provider') {
    const { hasProviderSecret } = require('./secrets');
    return hasProviderSecret('your-provider', 'apiKey');
  }
  
  return false;
}
```

### 4. Document Environment Variable

Update README.md to document the new provider:

```markdown
#### YourProvider
To enable YourProvider, set your API key via environment variable:

\`\`\`bash
export YOURPROVIDER_APIKEY=your_api_key_here
npm start
\`\`\`

**Get your API key:** Visit [YourProvider](https://yourprovider.com/) to create an account.
```

### 5. Add Verification Script (Optional)

Create `test-your-provider.js` for manual testing:

```javascript
#!/usr/bin/env node
const { YourProvider } = require('./dist/main/providers/your-provider');

async function testProvider() {
  console.log('=== YourProvider Test ===\n');
  
  const provider = new YourProvider();
  console.log('Provider ID:', provider.id);
  console.log('Provider Name:', provider.name);
  
  const isAvailable = await provider.isAvailable();
  console.log('Is Available:', isAvailable);
  
  if (!isAvailable) {
    console.log('\n✓ Provider correctly reports unavailable when no secret is present');
    return;
  }
  
  console.log('\n--- Attempting real API call ---');
  try {
    const response = await provider.sendMessage('Say "hello" in exactly one word.');
    console.log('\n✓ API call successful!');
    console.log('Response:', response);
  } catch (error) {
    console.error('\n✗ API call failed:', error.message);
  }
}

testProvider().catch(console.error);
```

## Secret Management Best Practices

### Environment Variables
The secrets system automatically checks environment variables in this format:
- `PROVIDERNAME_KEYNAME` (all uppercase)
- Example: `MINIMAX_APIKEY`, `OPENAI_APIKEY`

### Runtime Secrets (Advanced)
For UI-driven secret management, use `setProviderSecret`:

```typescript
import { setProviderSecret } from './secrets';

// In main process only
setProviderSecret('your-provider', 'apiKey', userProvidedKey);
```

### Security Rules
1. ✅ **DO** keep all secrets in main process
2. ✅ **DO** use `getProviderSecret()` to access keys
3. ✅ **DO** return only metadata to renderer
4. ❌ **DON'T** expose keys via IPC
5. ❌ **DON'T** log full API keys
6. ❌ **DON'T** commit keys to repository

## API Design Guidelines

### Short-Beat Responses
Configure your provider for concise responses where possible:
- Set lower `max_tokens` / `max_completion_tokens`
- Use system prompts that encourage brevity
- Consider the context of a chat interface (not essay generation)

Example system prompt:
```typescript
{
  role: 'system',
  content: 'You are a helpful AI assistant. Provide concise, direct responses.'
}
```

### Error Handling
Always wrap API calls in try-catch and provide helpful error messages:

```typescript
try {
  // API call
} catch (error) {
  if (error instanceof Error) {
    throw error;  // Preserve original error
  }
  throw new Error('YourProvider: unexpected error');
}
```

### Response Validation
Always validate API responses before returning:

```typescript
const content = data.choices?.[0]?.message?.content;
if (!content) {
  throw new Error('YourProvider returned empty response');
}
```

## Testing Checklist

Before submitting a provider implementation PR:

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Provider shows in list without secret
- [ ] Provider reports unavailable without secret
- [ ] Provider shows available with valid secret
- [ ] API call returns real content with secret
- [ ] No API key visible in DevTools Network tab
- [ ] No API key in IPC messages (check main console logs)
- [ ] Error messages are clear and actionable
- [ ] README updated with configuration instructions

## Example: MiniMax Provider

See `src/main/providers/minimax-provider.ts` for a complete reference implementation that:
- ✅ Uses proper TypeScript interfaces
- ✅ Handles API and service-level errors
- ✅ Validates response structure
- ✅ Never exposes secrets to renderer
- ✅ Integrates cleanly with AgentBus
- ✅ Includes verification script

## Current Providers

BotOS ships with the following provider implementations:

### OpenAI
- **Provider ID:** `openai`
- **Default Model:** `gpt-4o-mini`
- **Endpoint:** `https://api.openai.com/v1/chat/completions`
- **Environment Variable:** `OPENAI_APIKEY`
- **Configuration:** Optional `OPENAI_BASE_URL` override
- **Implementation:** `src/main/providers/openai-provider.ts`

### Anthropic Claude
- **Provider ID:** `anthropic`
- **Default Model:** `claude-sonnet-4-20250514`
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Environment Variable:** `ANTHROPIC_APIKEY`
- **Configuration:** Optional `ANTHROPIC_BASE_URL` override
- **Implementation:** `src/main/providers/anthropic-provider.ts`

### MiniMax
- **Provider ID:** `minimax`
- **Default Model:** `MiniMax-Text-01`
- **Endpoint:** `https://api.minimax.io/v1/text/chatcompletion_v2`
- **Environment Variable:** `MINIMAX_APIKEY`
- **Implementation:** `src/main/providers/minimax-provider.ts`

### Z.ai
- **Provider ID:** `zai`
- **Default Model:** `GLM-5.3`
- **Endpoint:** OpenAI-compatible endpoint (custom)
- **Environment Variable:** `ZAI_APIKEY`
- **Implementation:** `src/main/providers/zai-provider.ts`

### Coding Plan
- **Provider ID:** `coding-plan`
- **Default Model:** `gpt-4o`
- **Endpoint:** OpenAI-compatible endpoint (custom)
- **Environment Variables:** `CODING_PLAN_APIKEY`, optional `CODING_PLAN_BASE_URL`
- **Implementation:** `src/main/providers/coding-plan-provider.ts`

### Mock Providers
- **Provider IDs:** `mock-echo`, `mock-intelligent`
- **No API keys required** - Local simulation
- **Implementation:** `src/main/providers/mock-providers.ts`

## Future Enhancements

Planned improvements to the provider system:
- UI for adding/managing provider secrets
- Provider-specific settings UI
- Streaming response support
- Rate limiting and retry logic
- Provider health monitoring
- Usage analytics and token tracking
