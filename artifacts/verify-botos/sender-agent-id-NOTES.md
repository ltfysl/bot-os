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
