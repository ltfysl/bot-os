# Secret Request Card Implementation

## Overview

This document describes the BotOS secret request card implementation for provider API key entry. The card follows Nyx design principles with premium feel, masked input, and write-only IPC security.

## Architecture

### Component Structure

```
SecretRequestCard.tsx (renderer/components/)
├── Modal overlay with click-outside dismiss
├── Masked password input (type="password")
├── Primary "Confirm" + quiet "Cancel" buttons
├── Inline error display
└── Auto-focus on mount
```

### Security Model

**Write-Only IPC:**
- `setProviderSecret(providerId, secret)` → `{success, error?}`
- Renderer NEVER reads secret back
- Main process stores in `secrets.ts` memory
- Provider `hasSecret`/`isAvailable` flips after save

**No Secret Leakage:**
- ✅ Input type="password" (bullets)
- ✅ State cleared on submit
- ✅ No console.log of secret
- ✅ IPC handler doesn't echo secret back
- ✅ DevTools Network tab shows no plaintext

### Flow

```
Provider menu "Needs key" click
  ↓
SecretRequestCard opens
  ↓
User enters key (masked)
  ↓
Submit → setProviderSecret IPC
  ↓
Main process: secrets.setProviderSecret(id, 'apiKey', value)
  ↓
Success: card dismisses, providers refresh
Failure: error message displayed inline, card stays open
```

## UI States

| State | Description | Visual |
|-------|-------------|--------|
| Idle | Card open, input empty | Border default |
| Focused | Input focused | Border accent-quiet |
| Submitting | API call in progress | Disabled, "Saving..." |
| Success | Secret saved | Auto-dismiss after 300ms |
| Error | Save failed | Inline error, card stays open |

## Keyboard Shortcuts

- **Enter**: Submit secret (when input not empty)
- **Escape**: Close card (cancel)

## CSS Classes

```css
.secret-card-overlay   /* Modal backdrop */
.secret-card           /* Card container */
.secret-card-header    /* Label section */
.secret-card-label     /* Provider name display */
.secret-card-input     /* Masked password field */
.secret-card-error     /* Inline error message */
.secret-card-actions   /* Button row */
.secret-card-cancel    /* Quiet cancel button */
.secret-card-confirm   /* Primary confirm button */
```

## Integration Points

### ChatView.tsx
- State: `showSecretCard`, `secretCardProvider`
- Handler: `handleNeedsKeyClick(provider)`
- Callback: `handleSecretSuccess()` refreshes providers
- Renders: `<SecretRequestCard />` conditionally

### Provider Menu
- Unavailable providers show "Needs key"
- Click opens secret card (no longer disabled)
- Success updates `isAvailable: true`

## IPC Handler (main.ts)

```typescript
ipcMain.handle('set-provider-secret', async (_event, providerId: string, secret: string) => {
  try {
    const { setProviderSecret } = await import('./secrets');
    setProviderSecret(providerId, 'apiKey', secret);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save secret',
    };
  }
});
```

## Preload API (preload.ts)

```typescript
setProviderSecret: (providerId: string, secret: string): Promise<{ success: boolean; error?: string }> =>
  ipcRenderer.invoke('set-provider-secret', providerId, secret),
```

## Testing Checklist

Manual testing steps:

1. **Card Opens**
   - [ ] Click "Needs key" on unavailable provider
   - [ ] Card appears with correct provider name
   - [ ] Input is auto-focused

2. **Input Behavior**
   - [ ] Typing shows bullets (password masked)
   - [ ] Confirm disabled when empty
   - [ ] Confirm enabled with text

3. **Keyboard Shortcuts**
   - [ ] Enter submits when not empty
   - [ ] Escape closes card
   - [ ] Both work when input focused

4. **Submit Flow**
   - [ ] Button shows "Saving..." while submitting
   - [ ] Input disabled during submit
   - [ ] Success: card dismisses
   - [ ] Success: provider now shows available
   - [ ] Failure: error appears below input
   - [ ] Failure: card stays open

5. **Security Verification**
   - [ ] Open DevTools Network tab
   - [ ] Submit secret
   - [ ] Verify no plaintext in IPC logs
   - [ ] Verify no secret in React DevTools state after submit
   - [ ] Check main console: no secret logged

6. **UI Polish**
   - [ ] Overlay dismisses on click-outside
   - [ ] Focused border accent color
   - [ ] Error text is muted red
   - [ ] Button hover states work
   - [ ] Animations smooth (fade-in, slide-in)

## Future Enhancements

- [ ] Support multiple secret fields per provider (beyond `apiKey`)
- [ ] Add "Test connection" button after secret entry
- [ ] Show last 4 characters of saved key (e.g., "••••1234")
- [ ] Provider-specific help text or API key link
- [ ] Validation regex per provider (key format check)
- [ ] Electron keychain integration for persistence
- [ ] "Remember me" checkbox for session vs permanent storage

## Files Modified

- `src/renderer/components/SecretRequestCard.tsx` (new)
- `src/renderer/components/ChatView.tsx`
- `src/renderer/index.css`
- `src/renderer/types.ts`
- `src/main/preload.ts`
- `src/main/main.ts`

## Dependencies

- Existing `secrets.ts` module (no changes needed)
- Provider `isAvailable()` method checks secret existence
- AgentBus `providerHasSecret()` integration

---

**Status:** ✅ Shipped in PR #15
