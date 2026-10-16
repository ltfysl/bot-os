# #59 user-message queue: verify-botos notes (2026-10-16)

## What changed (src/main/agent-bus.ts, main.ts wiring)
- A user message is never dropped as `already-in-flight`. If the target agent is busy (any chain), the message waits
  and runs right after the wakes that were on the agent when it arrived (snapshot, FIFO among queued user messages).
  This applies to room @mentions (`enqueueOrderedWakes` with `{ userMessage: true }` at depth 1), the room primary
  and DM primary (`sendMessageWithWakeStream` / `sendMessageWithWake` via `runUserTurn`).
- A queued user message gets its own new chainId and its own budget (1 of `MAX_CHAIN_WAKES`), with `fromChainId` for the
  chain it came in on. Its later reply mentions run in that chain. It is not in the bot chain's `currentWakeIds`, so
  `cancelWakeChain(botChain)` does not touch it. `cancelWakeChain(queuedChain)` and `cancelWake(wakeId)` still cancel it.
- Dedupe and in-flight skips stay only for bot-triggered wakes (reply mentions at depth > 1 and `requestAgentWake`).
- Remy's case: `requestAgentWake` on an agent that only waits for a user message is not skipped and is charged to the
  initiator's root/parent chain as before. The user chain budget stays at 1.
- New event `user-queued` (IPC: `wake-user-queued`: wakeId, chainId, fromChainId, targetAgentId, roomId,
  waitingForWakeIds). It has a preload `onWakeUserQueued` and types, but no renderer UI yet; that's Vale's part.
  `wake-depth-exceeded` IPC now forwards `chainId`.
- These are unchanged: releaseChain idempotent, ensureChain/endChain cleanup, requestRootChains/requestTargets,
  depth/membership refusals before budget, and chainId on depth/budget events.

## Evidence
- `npm run type-check`: 0 errors. `npm run build`: ok.
- `user-message-queue-harness.js` → `user-message-queue-output.json`: pass. This runs at the IPC level: real
  handlers from dist/main/main.js, electron stubbed, and the app's mock providers scripted. The cases are:
  (a) a room user message during an in-flight bot wake queues, runs after it, and has 0 `already-in-flight`;
  (a2) the same for a DM; (b) a distinct chainId (≠ bot chain, ≠ incoming chain), with the `wake-started` of the
  queued wake carrying it, a budget of 1 while waiting, and freed at the end; (c) `cancel-wake-chain(botChain)` cancels
  the bot wake only, and the queued user wake still runs; (d) Remy's `request-agent-wake` on a queued-only agent
  succeeds with 0 in-flight skips, runs on the initiator's root chain, and leaves the user chain budget at 1→1;
  (e) cancelling the queued chain cancels the waiting message and frees its budget; bot dedupe is still kept. It
  passed on 4 consecutive runs.
- Existing harnesses were rerun green: request-wake-budget, wake-timeout-stop and sender-agent-id give
  identical JSON; room-primary-early-fail is identical apart from the ids. single-membership-denied,
  reply-mention-wakes, wake-chain-cancel and wake-depth-guard all exit 0 with the expected output.
- `npm start`: the window came up and was driven. In the DM to Assistant, "hi @Coder quick check" got an answer
  (`user-message-queue-chat.png`). In Team Chat, "@Assistant ping @Coder" got both answers
  (`user-message-queue-room.png`). The renderer crashed 0 times; only the usual GPU warnings appeared.
- Renderer observation, out of scope (Vale): a second DM message typed while the first one is streaming doesn't
  get sent from the composer, so the DM queue is only exercised at the IPC level.
