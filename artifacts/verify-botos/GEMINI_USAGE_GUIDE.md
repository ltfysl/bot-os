# Gemini Provider - User Guide

## Quick Start

### Option 1: Environment Variable (Recommended for Development)

```bash
export GEMINI_API_KEY=your_api_key_here
npm start
```

The provider will automatically detect the API key and show as available.

### Option 2: UI-Stored Secret (Recommended for Production)

1. Launch BotOS
2. Open Settings → Providers
3. Find "Google Gemini" in the provider list
4. Click "Configure" or "Add API Key"
5. Enter your Gemini API key
6. Click "Save"

The key is encrypted and stored securely on your machine.

## Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Navigate to "API Keys"
4. Click "Create API Key"
5. Copy the generated key

**Note:** Keep your API key secure. Never commit it to version control or share it publicly.

## Using Gemini with Agents

### Assign Gemini to an Agent

1. Open the Agent settings (click on an agent's name)
2. Under "Provider", select "Google Gemini"
3. The agent will now use Gemini for all responses

### Send Messages

Just chat normally! The agent will route messages through Gemini.

**Example:**
```
You: What is quantum computing?
Agent (via Gemini): Quantum computing is a type of computing that...
```

## Configuration Options

### Default Model

The provider uses `gemini-2.0-flash` by default. This is:
- Fast response times
- High quality outputs
- Cost-effective

### Custom Base URL (Advanced)

If you want to use a different endpoint:

```bash
export GEMINI_BASE_URL=https://your-custom-endpoint.com/v1/chat/completions
npm start
```

**When to use:**
- Proxy through a custom gateway
- Use a different Gemini API version
- Route through a load balancer

### Token Limits

Default: 512 max completion tokens

This provides concise responses suitable for chat. For longer responses, this can be adjusted in a future update.

## Features

### ✅ Supported

- **Text Generation** - Ask questions, get answers
- **Streaming** - Responses appear progressively as they generate
- **Multi-turn Conversations** - Context from previous messages
- **@-mentions** - Wake other agents in rooms
- **Error Handling** - Clear error messages if something goes wrong

### ❌ Not Yet Supported

- **Function Calling** - Cannot call external tools/functions
- **Image Input** - Text-only for now
- **Custom System Prompts** - Uses default prompt
- **Token Usage Display** - Not shown in UI (but tracked in backend)

## Troubleshooting

### "Gemini API key not configured"

**Cause:** No API key is set.

**Solution:**
- Set `GEMINI_API_KEY` environment variable, or
- Enter API key via UI in provider settings

### "Gemini API error 401"

**Cause:** Invalid or expired API key.

**Solution:**
1. Verify your API key is correct
2. Check the key hasn't been revoked in Google AI Studio
3. Generate a new key if needed

### "Gemini returned empty response"

**Cause:** API returned successfully but with no content.

**Solution:**
- Try a different prompt
- Check Google AI Studio for service status
- Verify the model name is correct

### Provider shows as unavailable

**Cause:** No API key is detected.

**Solution:**
1. Check `GEMINI_API_KEY` environment variable is set
2. Or enter API key via UI
3. Restart the app

## Best Practices

### 1. Keep Your Key Safe

- ✅ Use environment variables for development
- ✅ Use UI-stored secrets for production
- ❌ Don't commit keys to git
- ❌ Don't share keys publicly

### 2. Optimize for Chat

Gemini works best with:
- Clear, specific questions
- Concise prompts (not essays)
- Follow-up questions in context

### 3. Monitor Usage

- Track your API usage in Google AI Studio
- Set up billing alerts if needed
- Use Flash models for cost efficiency

### 4. Handle Errors Gracefully

If Gemini is unavailable:
- Switch agent to another provider (OpenAI, Anthropic)
- Check the console for error details
- Verify your API key and internet connection

## Comparison with Other Providers

| Feature | OpenAI | Anthropic | Gemini |
|---------|--------|-----------|--------|
| Speed | Fast | Medium | Very Fast |
| Quality | High | High | High |
| Streaming | ✅ | ❌ | ✅ |
| Cost | $$ | $$$ | $ |
| Token Limit | 4096+ | 4096+ | 2M+ |

**When to use Gemini:**
- Need fast responses
- Cost-conscious usage
- Long context windows
- Prefer Google's model characteristics

## Advanced Usage

### Multiple Agents with Different Providers

You can mix providers:
- Agent 1 (Assistant) → Gemini
- Agent 2 (Researcher) → OpenAI
- Agent 3 (Coder) → Anthropic

Each agent uses its assigned provider independently.

### Streaming Responses

Streaming is enabled by default. You'll see responses appear word-by-word as they generate.

**To observe streaming:**
1. Send a longer prompt (e.g., "Explain quantum computing in detail")
2. Watch the response appear progressively
3. No need to wait for the full response before reading

### Room Coordination

Gemini works in rooms with multiple agents:

```
User: @Assistant @Researcher what is quantum computing?
```

Both agents will respond using their respective providers.

## API Rate Limits

Google AI Studio free tier:
- 60 requests per minute
- 1,500 requests per day

**If you hit rate limits:**
- Wait a minute before retrying
- Upgrade to paid tier in Google AI Studio
- Consider using multiple API keys with round-robin

## Support & Resources

- **Google AI Documentation:** https://ai.google.dev/gemini-api/docs
- **BotOS Provider Guide:** `PROVIDERS.md`
- **Issue Tracker:** https://github.com/ltfysl/bot-os/issues
- **Verification Docs:** `artifacts/verify-botos/gemini-provider-verification.md`

## Example Workflows

### Workflow 1: Quick Question

```
1. Set GEMINI_API_KEY
2. Launch app
3. Select agent
4. Ask: "Summarize quantum computing in 3 sentences"
5. Receive fast, concise response
```

### Workflow 2: Long Conversation

```
1. Configure Gemini via UI
2. Create new conversation
3. Ask initial question
4. Follow up with related questions
5. Gemini maintains context across messages
```

### Workflow 3: Multi-Agent Room

```
1. Create room with multiple agents
2. Assign Gemini to one agent
3. @-mention that agent with questions
4. Agent responds via Gemini
5. Other agents can respond via their providers
```

---

**Version:** 1.0  
**Last Updated:** September 7, 2026  
**Provider Status:** ✅ Production Ready
