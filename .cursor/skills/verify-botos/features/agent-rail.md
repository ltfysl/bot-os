# Agent Rail Verification

## Feature Overview

The "agent rail" refers to provider switching, agent-provider bindings, and the secret management flow that enables providers to become available.

## Critical Paths

### Path 1: Provider Switching

**When to verify:** Changes to provider menu, agent-bus provider logic, or ChatView provider toggle

**Steps:**
1. Launch app and select an agent
2. Note the current provider in the header (e.g., "MockEcho")
3. Click the ⚙ icon to open provider menu
4. Verify provider menu displays all providers
5. Click a different available provider
6. Verify menu closes
7. Send a message
8. Observe response uses new provider's style

**Expected behavior:**
- Provider menu shows all registered providers
- Current provider highlighted with "active" class
- Unavailable providers show "Needs key" label
- Clicking available provider switches immediately
- Agent name still visible in header after switch

**Evidence:**
- Screenshot: `provider-menu-open.png`
- Screenshot: `provider-switched.png`
- Console: No errors from `updateAgentProvider` call

### Path 2: Provider Availability States

**When to verify:** Changes to provider registration, secrets, or availability checks

**Steps:**
1. Open provider menu
2. Identify providers with "Needs key" label
3. Verify clicking them doesn't switch (opens secret card instead)
4. Check providers marked as available
5. Verify clicking available providers switches normally

**Expected behavior:**
- Available providers: clickable, switch immediately
- Unavailable providers: show "Needs key", open secret card on click
- Menu layout consistent regardless of availability

**Evidence:**
- Screenshot: `provider-menu-availability.png`

### Path 3: Menu Interactions

**When to verify:** Changes to provider menu dropdown or click-outside logic

**Steps:**
1. Open provider menu (click ⚙)
2. Click outside the menu area
3. Verify menu closes
4. Open menu again
5. Press Escape key
6. Verify menu closes

**Expected behavior:**
- Click outside closes menu
- Escape key closes menu
- Clicking provider item closes menu
- Menu doesn't reopen unintentionally

**Evidence:**
- Screenshot: `provider-menu-close.png`

### Path 4: Agent-Provider Persistence

**When to verify:** Changes to agent registration or provider binding logic

**Steps:**
1. Switch Agent 1 to ProviderX
2. Switch Agent 2 to ProviderY
3. Switch back to Agent 1
4. Open provider menu
5. Verify ProviderX is active for Agent 1
6. Switch to Agent 2
7. Verify ProviderY is active for Agent 2

**Expected behavior:**
- Each agent remembers its provider independently
- Provider selection persists during app session
- Switching agents doesn't mix up providers

**Evidence:**
- Screenshot: `agent1-provider.png`
- Screenshot: `agent2-provider.png`

## Edge Cases to Test

- **All unavailable**: Scenario where no providers have secrets (verify graceful degradation)
- **Rapid switching**: Switch providers multiple times quickly
- **Mid-conversation switch**: Switch provider while "Thinking..." indicator is active

## Regression Checks

If you've changed code outside provider logic but want to verify agent rail:

- [ ] Open provider menu on at least one agent
- [ ] Switch to a different provider
- [ ] Send a message to confirm new provider is used
- [ ] Check console for errors

## Related Components

- `src/renderer/components/ChatView.tsx` (provider menu UI)
- `src/main/agent-bus.ts` (`updateAgentProvider`, `getAllProviders`)
- `src/main/preload.ts` (IPC: `listProviders`, `updateAgentProvider`)
- `src/main/providers/` (provider implementations)

## IPC Calls Used

- `window.electronAPI.listProviders()` → `Promise<ProviderInfo[]>`
- `window.electronAPI.updateAgentProvider(agentId, providerId)` → `Promise<{ success: boolean }>`

## Provider Info Structure

```typescript
interface ProviderInfo {
  id: string;
  name: string;
  hasSecret: boolean;
  isAvailable: boolean;
}
```

**Key fields:**
- `isAvailable` - Determines if provider is clickable or shows "Needs key"
- `hasSecret` - Used to check if provider has credentials (main process only exposes boolean)
