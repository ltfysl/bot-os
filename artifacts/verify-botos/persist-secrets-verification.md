# verify-botos — persist provider secrets across restarts

Date: 2026-09-07
Branch: cursor/persist-provider-secrets-977a

## Problem
`src/main/secrets.ts` was RAM-only — keys set via SecretRequestCard died on app restart. Env vars still worked; in-app card keys did not.

## Solution
Persist provider secrets with Electron `safeStorage` (OS-backed encryption), reload into in-memory store on boot, keep existing write-only IPC contract.

## Changes

### src/main/secrets.ts
- Added `loadPersistedSecrets()` to load encrypted secrets from userData/secrets.enc on boot
- Added `persistSecrets()` to save encrypted secrets after set/clear operations
- Uses `safeStorage.encryptString()` / `decryptString()` when encryption is available
- Falls back gracefully (logs warning) if safeStorage encryption unavailable
- Made `setProviderSecret` and `clearProviderSecret` async to support persistence
- Secrets stored at `app.getPath('userData')/secrets.enc` using OS-backed encryption

### src/main/main.ts
- Import `loadPersistedSecrets` from secrets module
- Call `await loadPersistedSecrets()` after `app.whenReady()` (safeStorage requires app ready)
- Updated IPC handlers to `await` the now-async `setProviderSecret` and `clearProviderSecret`

## Verification Checklist

| Check | Status | Notes |
|-------|--------|-------|
| type-check | ✅ PASS | `npm run type-check` succeeds |
| build | ✅ PASS | `npm run build` succeeds |
| Write-only IPC | ✅ PASS | No `getProviderSecret` in preload; signatures unchanged |
| No key echo | ✅ PASS | No keys in IPC responses, logs stay write-only |
| Param naming | ✅ PASS | `secretName` in preload/IPC, store key `apiKey` unchanged |
| Env fallback | ✅ PASS | `getProviderSecret` still checks env vars with normalize |
| Main-process only | ✅ PASS | Plaintext secrets never leave main process |
| Encryption check | ✅ PASS | Uses `safeStorage.isEncryptionAvailable()` before encrypt/decrypt |
| Fallback behavior | ✅ PASS | Logs warning if encryption unavailable, refuses persist |

## Manual Testing Required

To fully verify this slice:

1. **Set secret → restart → secret persists:**
   - Launch app
   - Use SecretRequestCard to set a provider API key (e.g., anthropic)
   - Verify provider becomes available
   - Restart app (quit completely)
   - Verify provider is still available (secret was reloaded from disk)

2. **Clear → restart → secret gone:**
   - With a persisted secret active
   - Clear the secret (via UI if implemented, or manually delete secrets.enc)
   - Restart app
   - Verify provider shows as unavailable (needs key)

3. **Write-only/no-echo intact:**
   - Set a secret via SecretRequestCard
   - Check IPC responses, console logs, and renderer devtools
   - Verify no plaintext key appears anywhere outside main process

4. **Env fallback still works:**
   - Set `ANTHROPIC_APIKEY=test-key` env var
   - Launch app (without persisted secret for anthropic)
   - Verify anthropic provider is available
   - Env var takes precedence when no in-app secret exists

## Security Properties

- Secrets encrypted at rest using OS keychain (macOS Keychain, Windows Credential Store, Linux Secret Service)
- No plaintext secrets in memory except main process SecretStore
- No getProviderSecret exposed to renderer
- File stored in userData (sandboxed per-app)
- Falls back to refusing persistence if encryption unavailable

## Out of Scope

- No new providers
- No streaming changes
- No chrome/UI polish (Vale/Nyx)
- No "clear key" UI unless strictly required
