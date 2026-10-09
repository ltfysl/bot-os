# PR #50 verify-botos — provider stream error unlock
Commit: 00055c3 · 2026-10-09 (Europe/Berlin)
## Doctor
- npm run type-check: exit 0 · npm run build: exit 0
## Manual Electron (fake OPENAI_API_KEY, Assistant -> OpenAI)
- Send -> single `Error: OpenAI API error 401 ...` bubble, key masked by OpenAI (sk-fake-***pr50); composer re-enabled: PASS
- Coder (mock) send/reply after error: PASS; switch back to Assistant composer unlocked: PASS
- Team Chat composer enabled (no send): PASS (room error lock still open per NOTES)
## Soft
- Error bubble shows full raw provider JSON body (noisy; relies on provider masking keys)
- DM history resets on agent switch (pre-existing, not from this PR)
- '...' bubble not observed before error (401 too fast to catch)
## Verdict
MERGE
