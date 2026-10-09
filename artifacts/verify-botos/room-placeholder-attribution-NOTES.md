# Room "…" placeholder attribution (Remy soft, after #52)

## Root cause
The bus already sends the right ID: `wake-started.targetAgentId` and the room stream chunk `agentId` both name the real target. The bug was in the renderer. RoomView fed the typing placeholder from `lastAssistantMessage` (whoever spoke last, for example Coder), so it was a guess.

## Fix (follows Nyx's rule: never show a guessed agent)
- RoomView takes the replying agent only from `wake-started` (`roomId` + `targetAgentId`). It resets when loading ends and on room switch.
- MessageList: the placeholder shows name and avatar only if the caller passes a known agent, otherwise a neutral `…` and avatar. A stream with no `agentName` also falls back to neutral `…` instead of `Assistant`.
- DMs: ChatView still passes the active agent (known there), so nothing changes.

## Overlap with Vale #6
This covers the `…` placeholder in Team Chat and the `Assistant` label on streams. The wrong names on DM greetings stay with Vale.

## Not run
Desktop repro: `@Assistant ping` right after a Coder reply. Expected: the placeholder shows Assistant, or a neutral `…`, never Coder.
