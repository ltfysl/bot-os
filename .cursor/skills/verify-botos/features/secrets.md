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

### Path 3: Write-Only Security (No Key Echo)

**When to verify:** Changes to IPC security boundaries or SecretRequestCard

**Steps:**
1. Open SecretRequestCard for a provider
2. Type a fake API key in the input field
3. Observe input field shows bullets/dots (type=password)
4. Submit the secret
5. Verify card closes
6. Open DevTools Console
7. Try to access the secret value via any means (no get-secret IPC exists)
8. Check chat transcript for any echo of the secret value

**Expected behavior:**
- Input field is `type="password"` (shows dots/bullets, not plaintext)
- NO IPC method exists to read secrets back to renderer
- Renderer never receives the actual secret value after submission
- Secrets remain in main process only
- No secret value echoed in UI or console
- Password field prevents copy-paste visibility

**Evidence:**
- Screenshot: `secret-password-field.png` (showing masked input)
- Console: Confirm no `getProviderSecret` method in `window.electronAPI`

### Path 4: Keyboard Shortcuts

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

### Path 5: Cancel Flow

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

### Path 6: Error Handling

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

### Path 7: Click Outside to Close

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

### Path 9: Clear Provider Secret

**When to verify:** Changes to secret clearing or UI for removing secrets

**Steps:**
1. Set a secret for a provider (provider shows as available)
2. Clear the secret via UI or IPC (if UI exists)
3. Open provider menu
4. Verify provider now shows "Needs key" again
5. Attempt to use that provider with an agent
6. Verify provider unavailable error appears

**Expected behavior:**
- `clearProviderSecret` removes secret from main process
- Provider availability immediately reflects cleared state
- No remnants of secret value in memory or logs
- Returns `{ ok: true, cleared: true }` if secret existed
- Returns `{ ok: true, cleared: false }` if secret didn't exist

**Evidence:**
- Screenshot: `secret-cleared.png`
- Console log showing clear result

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
- `src/main/secrets.ts` (storage: `setProviderSecret`, `clearProviderSecret`, `hasProviderSecret`)
- `src/main/preload.ts` (IPC bridge: `setProviderSecret`, `clearProviderSecret`)
- `src/main/agent-bus.ts` (`providerHasSecret`, availability checks)

## IPC Calls Used

- `window.electronAPI.setProviderSecret(providerId, secretName, value)` → `Promise<{ ok: boolean, error?: string }>`
  - Stores a secret for a provider in main process
  - Returns `{ ok: true }` on success, `{ ok: false, error: string }` on failure
  - Never echoes the secret value back in the response
  - **Current usage**: SecretRequestCard passes `secretName` as `'apiKey'`

- `window.electronAPI.clearProviderSecret(providerId, secretName)` → `Promise<{ ok: boolean, cleared?: boolean, error?: string }>`
  - Removes a secret from main process storage
  - Returns `{ ok: true, cleared: true }` if secret existed and was removed
  - Returns `{ ok: true, cleared: false }` if secret did not exist
  - Returns `{ ok: false, error: string }` on validation errors
  - Never echoes the secret value back in the response

**Parameter details:**
- `providerId` - Provider identifier (e.g., `'minimax'`, `'zai'`)
- `secretName` - Secret key name (currently `'apiKey'` for all providers)
- `value` - Secret value (API key string)

## Security Notes

- **Write-only contract**: Renderer can only set and clear secrets, never read them
  - No `getProviderSecret` exposed to renderer process
  - IPC responses never echo secret values back to renderer
  - Only boolean status (`ok`, `cleared`) returned to renderer
- **Context isolation**: Secrets never exposed to renderer process memory or transcripts
- **Preload bridge**: IPC only allows setting and clearing secrets, not reading
- **Main process only**: Secret values remain in main process (checked via `hasProviderSecret` internally)
- **Storage**: Secrets stored in main process memory or env vars (not in localStorage or renderer-accessible storage)
- **Environment variables**: Providers check `MINIMAX_APIKEY`, `ZAI_APIKEY`, etc.
- **No echo in logs**: Secret values should never appear in console logs or IPC transcripts

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
