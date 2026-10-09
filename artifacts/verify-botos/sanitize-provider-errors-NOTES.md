# Sanitize provider errors at the source (Remy/Orin leak, after #50/#51)

## Leak
Providers threw `X API error <status>: <raw body>`. #50/#51 showed that text in the error row, including the JSON body with a masked key (`sk-test-****0000`).

## Fix
- `src/main/providers/error-text.ts`: `providerHttpError(name, status)` now gives status plus a short reason (401 Auth failed, 429 Rate limited, 5xx Provider unavailable, and so on). The response body is never forwarded.
- All HTTP providers (OpenAI, Anthropic, Gemini x2, xAI, MiniMax, Coding Plan) use it. Z.ai already sent the status only.
- `sanitizeErrorMessage` is a last line of defense on every error that leaves main: `message-stream-error`, `room-stream-error`, and `errorMessage` on every wake event (in `emitWakeEvent`). It cuts the JSON, redacts key-like tokens and Bearer values, and caps the length at 120 characters.

## Check
Smoke test from build output:
- `OpenAI API error 401: Auth failed`
- the raw JSON body becomes `OpenAI API error 401`
- `sk-test-****0000` becomes `[redacted]`
