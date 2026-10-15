# senderAgentId on stream chunks (#58)

## Change
- `message-stream-chunk` and `wake-stream-chunk` carry `senderAgentId`: the agent that wrote the chunk. `targetAgentId` stays the agent the user addressed.
- `wake-stream-chunk.id` is now the `wakeId`, stable for the whole wake, instead of a new `Date.now()` per chunk, so the renderer can grow one bubble per wake in place.
- Optional field, no renderer change in this PR: Vale's stream slots per `wakeId` build on it.

## verify-botos (2026-10-15, main 42a00ed + e1ec05a)
- `npm run type-check`: exit 0
- `npm run build`: exit 0
- `npm start`: the window opens with the agent rail and Assistant chat, and nothing crashes (`sender-agent-id-launch.png`). The box has no GPU or keyring, so only the usual `safeStorage` and GPU warnings show up.
- `node artifacts/verify-botos/sender-agent-id-harness.js`: DM to `coder` that wakes `@assistant`
  - primary chunks: 4, all with `senderAgentId: coder`
  - woken chunks: 4, all with `senderAgentId: assistant`, `targetAgentId: coder`, and one shared `id` (the `wakeId`)

## Re-pass after Remy's REQUEST CHANGES

- HARD: both `room-stream-chunk` emits in `send-room-message-stream` now carry `senderAgentId` (room primary uses `streamAgentId`, the ordered mention and bot-to-bot path uses `agentId`). `RoomStreamChunk` in `preload.ts` and `renderer/types.ts` has `senderAgentId?: string`.
- Soft 2: the room-primary bubble id switches to the `wakeId` on the first chunk; the persisted assistant message and the error row use it too.
- Soft 3: `sender-agent-id-harness.js` now stubs `electron`, loads `dist/main/main.js` and calls the real `ipcMain.handle` handlers (`send-message-stream`, `send-room-message-stream`, `get-room-messages`). Output: `sender-agent-id-harness-output.json`.
  - DM primary: every chunk has senderAgentId `1`. DM woken @Coder: `3`, id equals wakeId.
  - Room primary, room multi-mention (@Assistant @Coder) and room bot-to-bot (Assistant's reply wakes Coder): every chunk has senderAgentId, every id equals its wakeId, persisted assistant ids are wakeIds.
- DM primary `message-stream-chunk` ids are unchanged (not a wake path).
- type-check clean, build ok, `npm start` window up (`sender-agent-id-launch.png`).
