# Secret Request Card Chrome - Implementation Summary

## Overview

PR #16 ships the BotOS secret request card chrome, built on Ash's canonical IPC contract from PR #14. This is chrome-only - no duplicate IPC logic, wired to the 3-arg `setProviderSecret` signature.

## Architecture

### Layer Separation

**Ash Layer (#14 - IPC Foundation):**
- `setProviderSecret(providerId, secretName, value)` → `{ok, error?}`
- `clearProviderSecret(providerId, secretName)` → `{ok, cleared?, error?}`
- Main process handlers with validation
- Write-only security boundary
- Provider `hasSecret`/`isAvailable` metadata

**Vale Layer (#16 - Chrome Integration):**
- `SecretRequestCard` component
- Provider menu "Needs key" hook
- Masked input, keyboard shortcuts
- Error/success state handling
- Nyx premium styling

### Component: SecretRequestCard

```tsx
interface SecretRequestCardProps {
  providerId: string;      // e.g., "minimax", "zai"
  providerName: string;    // e.g., "MiniMax", "Z.ai"
  onClose: () => void;     // Dismiss handler
  onSuccess: () => void;   // Refresh providers
}
```

**State:**
- `secret` (string) - cleared after submit
- `isSubmitting` (boolean) - disables during save
- `error` (string | null) - inline error display

**Behavior:**
- Auto-focus input on mount
- Enter key submits (when not empty)
- Escape key cancels
- Click overlay to dismiss
- Success: clear state, call onSuccess, dismiss after 300ms
- Failure: show error, keep card open

## IPC Wire-up

### Call Site (SecretRequestCard.tsx)

```typescript
const result = await window.electronAPI.setProviderSecret(
  providerId,
  'apiKey',    // hardcoded secret name for API key providers
  secret       // user input from masked field
);

if (result.ok) {
  // Success path
  setSecret('');
  onSuccess();
  setTimeout(onClose, 300);
} else {
  // Error path
  setError(result.error || 'Failed to save key');
}
```

**Security Notes:**
- `secret` is cleared from component state immediately
- No `console.log` of secret values
- Password field prevents visual exposure
- IPC returns `{ok}` only - never echoes the key

### Integration (ChatView.tsx)

```typescript
const handleNeedsKeyClick = (provider: ProviderInfo) => {
  setSecretCardProvider({ id: provider.id, name: provider.name });
  setShowSecretCard(true);
  setShowProviders(false);
};

const handleSecretSuccess = async () => {
  await loadProviders();  // Refresh to see hasSecret: true
  onAgentsChange();       // Update agent list
};
```

**Provider Menu:**
- Unavailable providers show "Needs key"
- Click opens secret card (not disabled)
- Available providers switch directly
- Success updates both provider list and agent states

## UI/UX Specification

### Visual Design (Nyx Feel)

**Modal Overlay:**
- Semi-transparent black backdrop (`rgba(0,0,0,0.5)`)
- Centered card with drop shadow
- Click-outside to dismiss
- Fade-in animation (150ms)

**Card Layout:**
- Width: 360px
- Background: `--bg-secondary`
- Border: `--border-default`
- Border radius: 8px
- Padding: 16px
- Slide-in animation (200ms, translate -8px)

**Input Field:**
- Type: `password` (bullets/masks)
- Background: `--bg-tertiary`
- Border: `--border-default` → `--accent-quiet` on focus
- Font size: 14px
- Transition: 150ms ease

**Buttons:**
- Cancel: quiet (text-only), hover background
- Confirm: primary (`--accent-quiet` bg), hover darker
- Both: 6px vertical padding, 14px horizontal
- Disabled: 0.4 opacity, not-allowed cursor

**Error Display:**
- Font size: 12px
- Color: `#ef4444` (muted red)
- Margin top: 8px
- Line height: 1.4

### Keyboard Shortcuts

| Key | Action | Condition |
|-----|--------|-----------|
| Enter | Submit secret | Input not empty, not submitting |
| Escape | Close card | Any time |
| Tab | Focus navigation | Standard |

### State Indicators

**Idle:**
- Buttons enabled
- Input editable
- Border default

**Focused:**
- Input border: `--accent-quiet`
- No other visual change

**Submitting:**
- Confirm text: "Saving..."
- All inputs disabled
- Opacity: 0.4 on disabled elements

**Success:**
- No explicit success message
- Card dismisses after 300ms
- Provider menu "Needs key" clears

**Error:**
- Red text below input
- Card stays open
- User can edit and retry

## Security Properties

✅ **Write-Only IPC**
- Renderer calls `setProviderSecret` with value
- IPC returns `{ok, error?}` only
- No `getProviderSecret` in preload/renderer

✅ **No Secret Reads**
- Component state cleared after submit
- Password field masks all typing
- No logging or console output
- DevTools shows masked input only

✅ **Validation**
- Main process validates inputs
- Type checking on IPC boundary
- Error messages don't leak sensitive data

✅ **Scope Isolation**
- Secret stored in main process only
- Renderer sees metadata: `hasSecret`, `isAvailable`
- Provider availability checked server-side

## CSS Classes Reference

```css
.secret-card-overlay      /* Modal backdrop */
.secret-card              /* Card container */
.secret-card-header       /* Label section */
.secret-card-label        /* "{Provider} API key" */
.secret-card-input        /* Masked password field */
.secret-card-error        /* Inline error text */
.secret-card-actions      /* Button row */
.secret-card-cancel       /* Quiet cancel button */
.secret-card-confirm      /* Primary confirm button */
```

**Additional Utility:**
```css
.provider-menu-item.unavailable  /* Clickable unavailable providers */
.provider-menu-item .needs-key   /* "Needs key" label pointer cursor */
```

## Testing Verification

### Type Safety
```bash
npm run type-check  # ✅ Passes
npm run build       # ✅ Passes
```

### Functional Tests

**Card Opens:**
- [ ] Click "Needs key" on MiniMax (unavailable)
- [ ] Card appears with "MiniMax API key" label
- [ ] Input is auto-focused
- [ ] Confirm button is disabled (empty input)

**Input Behavior:**
- [ ] Typing shows bullets (password masked)
- [ ] Confirm enabled when text present
- [ ] Enter key submits (when enabled)
- [ ] Escape key closes card

**Submit Success:**
- [ ] Valid key submission
- [ ] Button shows "Saving..."
- [ ] All inputs disabled
- [ ] Card dismisses after brief delay
- [ ] Provider menu now shows MiniMax available
- [ ] "Needs key" label disappears

**Submit Failure:**
- [ ] Invalid key submission (e.g., empty string via IPC)
- [ ] Error appears below input
- [ ] Card stays open
- [ ] Can edit and retry

**Security Checks:**
- [ ] DevTools Network: no plaintext secret in IPC
- [ ] React DevTools: state cleared after submit
- [ ] Console: no logged secret values
- [ ] Password field: copy shows bullets only

### Edge Cases

- [ ] Click overlay while submitting (no dismiss)
- [ ] Escape during submit (should work)
- [ ] Multiple rapid clicks on Confirm
- [ ] Empty string submission
- [ ] Very long secret string
- [ ] Special characters in secret

## Integration Path

### Merge Order

1. **Merge PR #14 first** (Ash's IPC foundation)
   - Sets up `setProviderSecret` handlers
   - Adds type interfaces
   - Establishes security boundary

2. **Then merge PR #16** (this chrome layer)
   - Adds UI component
   - Wires to existing IPC
   - No conflicts with #14

### Rebase Strategy

If #14 is already on `main`:
```bash
git checkout cursor/secret-card-chrome-ash-ipc-7c64
git rebase main
git push --force-with-lease
```

Otherwise, this PR is already based on #14's branch and will merge cleanly.

## Future Enhancements

### Short Term
- [ ] Support multiple secret types beyond `apiKey`
- [ ] Provider-specific help text / API key links
- [ ] "Test connection" after secret entry
- [ ] Show last 4 chars of saved key (e.g., `••••1234`)

### Medium Term
- [ ] Validation regex per provider (key format check)
- [ ] Electron keychain integration (persistent storage)
- [ ] "Remember me" option for session vs permanent
- [ ] Bulk provider setup wizard

### Long Term
- [ ] OAuth2 flow for providers that support it
- [ ] Secret rotation UI
- [ ] Audit log of secret changes
- [ ] Team/shared secret management

## Troubleshooting

### Card doesn't open
- Check `listProviders()` returns correct `isAvailable: false`
- Verify `handleNeedsKeyClick` is wired to unavailable items
- Console: look for React errors

### Submit fails silently
- Check network tab for IPC call
- Verify Ash's IPC handler is present on branch
- Console: look for `setProviderSecret` errors

### Success but provider still unavailable
- Check `isAvailable()` implementation in provider class
- Verify secret is actually stored in main process
- Try restarting app (in case of stale state)

### Secret appears in logs
- Audit all `console.log` statements
- Check React DevTools state after submit
- Verify password field masking

---

**Status:** ✅ PR #16 open, based on Ash #14, chrome-only implementation
**Dependencies:** PR #14 must merge first (or rebase #16 onto main after #14 merges)
**Security:** Write-only IPC, no secret reads in renderer, types/build pass
