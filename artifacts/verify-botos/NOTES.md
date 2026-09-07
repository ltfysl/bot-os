# BotOS Verification Notes

This file contains summaries and quick links to verification evidence for BotOS PRs.

---

## PR #29 - Inline Question Widgets

**Branch:** `cursor/inline-question-widgets-d5be`  
**Date:** 2026-09-07  
**Commit:** 39b1fb0  
**Status:** ✅ Build Pass, ✅ Code Verified, ⚠️ GUI Unavailable  

**What changed:**
- Added inline question widget system (`WidgetCard.tsx`)
- Premium floating card chrome matching `SecretRequestCard` family
- Four widget types: single-select, multi-select, danger, allow-custom
- IPC seam: `onWidgetRequest` / `respondToWidget` (secret-safe)
- Resolved widgets persist as checked summaries in transcript
- Widgets render even when chat is empty (no messages)
- Demo triggers via keyword detection in messages

**Build checks:**
- ✅ `npm install` - 317 packages, no errors
- ✅ `npm run type-check` - TypeScript compilation clean
- ✅ `npm run build` - Main + renderer builds successful (169.74 kB)

**Nyx Feel Compliance:**
- ✅ Hairline border, calm dark fill, soft shadow
- ✅ Lucide 14-16px icons (Check for resolved state)
- ✅ 4-8px internal rhythm
- ✅ Chip/row layouts based on option count
- ✅ States: idle → selected → submitting → resolved
- ✅ No Slack Block Kit / SaaS survey chrome

**Manual testing plan:**
1. Send "pick one" → single-select widget appears
2. Send "select multiple" → multi-select widget appears
3. Send "delete" → danger widget with red styling
4. Send "enter value" → allow-custom with text input
5. Verify resolved state persists as checked summary
6. Verify widgets appear in empty chat (zero messages)

**Details:** See full notes below (Widget System Components section)

---

## PR #28 - OpenAI Provider with Secret-Safe Pattern

**Branch:** `cursor/openai-provider-secret-safe-2dd7`  
**Date:** 2026-09-07  
**Status:** ✅ Build Pass, ✅ Code Verified, ⚠️ GUI Unavailable  

**What changed:**
- Added OpenAI Chat Completions provider (`src/main/providers/openai-provider.ts`)
- Follows exact secret-safe pattern from Anthropic/MiniMax providers
- Environment variable: `OPENAI_API_KEY` (primary, industry-standard) + `OPENAI_APIKEY` (alternative via secrets.ts)
- Key resolution: `config.apiKey || getProviderSecret('openai','apiKey') || process.env.OPENAI_API_KEY`
- Default model: `gpt-4o-mini` for short-beat responses
- Registered in AgentBus, secret detection, and UI provider list

**Build checks:**
- ✅ `npm install` - 317 packages, no errors
- ✅ `npm run type-check` - TypeScript compilation clean
- ✅ `npm run build` - Main + renderer builds successful

**Security verification:**
- ✅ No `getProviderSecret` in preload.ts (write-only IPC)
- ✅ Key resolution formula: `config.apiKey || getProviderSecret('openai','apiKey') || process.env.OPENAI_API_KEY`
- ✅ Dual env var support: `OPENAI_API_KEY` (primary) + `OPENAI_APIKEY` (alternative via secrets.ts)
- ✅ `hasSecret` matches `isAvailable()`: checks both `hasProviderSecret('openai','apiKey')` OR `process.env.OPENAI_API_KEY`
- ✅ IPC responses never echo API keys

**Documentation:**
- ✅ README.md updated with OpenAI configuration section
- ✅ PROVIDERS.md updated with OpenAI entry

**Manual testing plan:**
1. Set secret via SecretRequestCard → provider becomes available
2. Clear secret → provider shows "Needs key" again
3. No key echo in DevTools or IPC calls
4. Environment variable fallback: `export OPENAI_API_KEY=...` works (primary)
5. Alternative env var: `export OPENAI_APIKEY=...` also works (via secrets.ts normalization)

**Details:** [openai-provider-verification.md](./openai-provider-verification.md)

---

## PR #27 - Nyx Density/Icons Fix

**Branch:** `cursor/visual-redesign-icons-dense-chat-cbdf`  
**Date:** 2026-09-07  
**Status:** ✅ Build Pass, ✅ Source Verified, ⚠️ GUI Unavailable  

**What changed:**
- Dense chat gaps: 5px message spacing
- No emoji in chrome: empty channel icon strings
- Thinking indicator: single "…" with 0.5 opacity
- Tighter rail/header/composer spacing (64px rail, 44px header, 10-12px composer)

**Details:** [pr23-2026-09-07.md](./pr23-2026-09-07.md)

---

## Template for Future PRs

**Branch:** `cursor/<feature-name>-<hash>`  
**Date:** YYYY-MM-DD  
**Status:** ✅/⚠️/❌ Build, ✅/⚠️/❌ Verified, ✅/⚠️ GUI  

**What changed:**
- Bullet point summary of feature/fix

**Build checks:**
- Status of install/type-check/build

**Manual testing highlights:**
- Key user-facing behaviors verified

**Details:** [link-to-detailed-verification.md](./filename.md)

---

# Detailed Widget System Components (PR #29)

## Widget Types

1. **WidgetCard.tsx** - Premium inline question component
   - Single-select (auto-submit on selection)
   - Multi-select (with Confirm button)
   - Danger mode (destructive action styling)
   - Allow-custom (preset options + custom text input)

2. **CSS Styling** - Matching SecretRequestCard family
   - Hairline border, calm dark fill, soft shadow
   - 4-8px rhythm inside cards
   - Quiet accent states for selected options
   - Resolved state collapses to checked summary
   - No emoji chrome (lucide icons only)

3. **IPC Seam** - Secret-safe renderer/main boundary
   - `onWidgetRequest` - Renderer listens for widget requests
   - `respondToWidget` - Renderer sends widget responses
   - Types fully defined in preload.ts and types.ts

4. **Demo Triggers** - Keyword detection in main.ts
   - "pick one" / "choose one" → single-select widget
   - "select multiple" / "pick several" → multi-select widget
   - "delete" / "remove" → danger widget
   - "custom input" / "enter value" → allow-custom widget

## Architecture Notes

- One widget at a time (no stacking)
- Mounts inline in MessageList between agent avatar and message content
- Auto-scrolls transcript when widget appears
- Composer remains honest below (no overlap)
- Error handling with muted inline error text
- Resolved widgets persist in `resolvedWidgets[]` state array
- Widgets render even when `messages.length === 0`

## Visual Compliance (Nyx Feel Bar)

✅ Surface: Premium floating card in chat column  
✅ Border: Hairline with calm dark fill  
✅ Shadow: Soft shadow on card only  
✅ Icons: Lucide 14-16px (Check icon for resolved state)  
✅ Density: 4-8px internal rhythm  
✅ States: idle → selected → submitting → resolved  
✅ Anti-patterns avoided: No Slack Block Kit, no SaaS survey chrome, no emoji icons

## Files Changed

- `src/renderer/components/WidgetCard.tsx` (new)
- `src/renderer/components/ChatView.tsx` (modified)
- `src/renderer/components/MessageList.tsx` (modified)
- `src/renderer/types.ts` (modified)
- `src/renderer/index.css` (modified)
- `src/main/preload.ts` (modified)
- `src/main/main.ts` (modified)

## Widget System Fixes (39b1fb0)

1. **Resolved state persistence** - Widget collapses to durable checked summary that stays visible in transcript
2. **Empty chat rendering** - Widgets render even when `messages.length === 0` (removed early return)
