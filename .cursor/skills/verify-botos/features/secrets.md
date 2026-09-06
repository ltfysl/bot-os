# Secrets Verification

## Feature Overview

Secrets management enables users to provide API keys for third-party providers (MiniMax, Z.ai, etc.). The SecretRequestCard component handles key entry, and the secrets module stores them securely in the main process.

## Critical Paths

### Path 1: Secret Request Card Appearance

**When to verify:** Changes to ChatView provider menu or SecretRequestCard component

**Steps:**
1. Launch app
2. Open provider menu on any agent
3. Find an unavailable provider (shows "Needs key")
4. Click the unavailable provider
5. Verify SecretRequestCard modal appears

**Expected behavior:**
- Card overlays main view with backdrop
- Header shows "[Provider] API key"
- Password input field visible
- Cancel and Confirm buttons present
- Input field auto-focused

**Evidence:**
- Screenshot: `secret-card-open.png`

### Path 2: Secret Entry and Submission

**When to verify:** Changes to SecretRequestCard, secrets IPC, or provider availability

**Steps:**
1. Open SecretRequestCard for a provider
2. Type a fake API key in the input
3. Click "Confirm"
4. Observe loading state ("Saving...")
5. Wait for success
6. Verify card closes
7. Reopen provider menu
8. Verify provider no longer shows "Needs key"

**Expected behavior:**
- Confirm button disabled until text entered
- Button shows "Saving..." during submission
- Card closes on success
- Provider list refreshes (provider now available)
- Agent list refreshes (agents can use new provider)

**Evidence:**
- Screenshot: `secret-card-filled.png`
- Screenshot: `secret-card-submitting.png`
- Screenshot: `provider-now-available.png`

### Path 3: Keyboard Shortcuts

**When to verify:** Changes to SecretRequestCard keyboard handlers

**Steps:**
1. Open SecretRequestCard
2. Press Escape key → verify card closes
3. Open SecretRequestCard again
4. Type an API key
5. Press Enter key → verify submission triggers

**Expected behavior:**
- Escape closes card without saving
- Enter submits form (same as clicking Confirm)
- No double-submission on Enter

**Evidence:**
- (Behavioral test, no screenshot needed)

### Path 4: Cancel Flow

**When to verify:** Changes to cancel/close logic

**Steps:**
1. Open SecretRequestCard
2. Type partial API key
3. Click "Cancel"
4. Verify card closes without saving
5. Reopen provider menu
6. Verify provider still shows "Needs key"

**Expected behavior:**
- Cancel closes card immediately
- No IPC call to save secret
- Provider availability unchanged

**Evidence:**
- Screenshot: `secret-card-cancel.png`

### Path 5: Error Handling

**When to verify:** Changes to error display or secret validation

**Steps (may require mocking):**
1. Open SecretRequestCard
2. Enter invalid key format (if validation exists)
3. Click Confirm
4. Observe error message

**Expected behavior:**
- Error message displayed below input
- Card remains open
- User can retry without reopening
- Error cleared on new input

**Evidence:**
- Screenshot: `secret-card-error.png`

### Path 6: Click Outside to Close

**When to verify:** Changes to modal backdrop or click handlers

**Steps:**
1. Open SecretRequestCard
2. Click backdrop (dark area outside card)
3. Verify card closes

**Expected behavior:**
- Clicking backdrop closes card
- No secret saved (same as Cancel)
- No errors in console

**Evidence:**
- (Behavioral test)

### Path 7: Secret Persistence

**When to verify:** Changes to secrets storage or process boundary

**Steps:**
1. Set a secret for a provider
2. Close app completely (Cmd/Ctrl + Q)
3. Relaunch app
4. Open provider menu
5. Verify provider still available (no "Needs key")

**Expected behavior:**
- Secrets persist across restarts (via environment variables or main process storage)
- Provider availability reflects persisted secrets on launch

**Evidence:**
- Screenshot: `secret-persisted.png`

### Path 8: Multiple Provider Secrets

**When to verify:** Changes to multi-provider secret management

**Steps:**
1. Set secret for Provider A
2. Set secret for Provider B
3. Open provider menu
4. Verify both show as available
5. Switch agent to Provider A → send message → works
6. Switch agent to Provider B → send message → works

**Expected behavior:**
- Each provider's secret stored independently
- No cross-contamination of keys
- Both providers functional simultaneously

**Evidence:**
- Screenshot: `multiple-secrets.png`

## Edge Cases to Test

- **Empty submission**: Try submitting with empty input (should be disabled)
- **Whitespace**: Enter only spaces (should be trimmed)
- **Very long key**: 100+ character API key
- **Rapid open/close**: Open and close card multiple times quickly

## Regression Checks

If you've changed code outside secrets but want to verify secrets work:

- [ ] Open SecretRequestCard for one provider
- [ ] Enter a fake key and submit
- [ ] Verify provider becomes available
- [ ] Switch agent to that provider
- [ ] Send a message (verify no "provider not available" error)
- [ ] Check console for errors

## Related Components

- `src/renderer/components/SecretRequestCard.tsx`
- `src/renderer/components/ChatView.tsx` (triggers card)
- `src/main/secrets.ts` (storage)
- `src/main/preload.ts` (IPC: `setProviderSecret`)
- `src/main/agent-bus.ts` (`providerHasSecret`, availability checks)

## IPC Calls Used

- `window.electronAPI.setProviderSecret(providerId, key, value)` → `Promise<{ ok: boolean, error?: string }>`

## Security Notes

- **Context isolation**: Secrets never exposed to renderer process
- **Preload bridge**: IPC only allows setting secrets, not reading
- **Storage**: Secrets stored in main process memory or env vars (not in localStorage)
- **Environment variables**: Providers check `MINIMAX_APIKEY`, `ZAI_APIKEY`, etc.

## Common Issues

**Provider still unavailable after setting secret:**
- Check console for IPC errors
- Verify provider `isAvailable()` method checks secrets correctly
- Restart app to reload environment variables

**Card doesn't close:**
- Check `onSuccess` and `onClose` callbacks wired correctly
- Verify IPC promise resolves

**Multiple cards stacked:**
- Ensure only one SecretRequestCard rendered at a time
- Check `showSecretCard` state management
