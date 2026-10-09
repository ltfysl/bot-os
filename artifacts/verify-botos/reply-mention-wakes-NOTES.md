# Bot-to-bot @mention wakes with lineage (bus slice after #56)

## What
A bot reply in a room that @mentions other agents now wakes them, in the same chain, at depth + 1.

- **Lineage stays in the main process only.** `wakeLineage` maps wakeId to `{ chainId, depth, initiatorAgentId }`. It's set when a wake *starts* and kept after the wake ends (capped at 1000 entries). Reply fan-out reads the bus's own record and never a payload from the renderer, so a renderer can't reset the depth (Remy).
- `enqueueOrderedWakes(..., chainId, depth)`: after a reply, `fanOutReplyMentions` wakes the mentioned agents with `depth + 1` and the same `chainId`. The initiator is the bot that replied.
- Above `MAX_WAKE_DEPTH = 4`, no wake runs, and each chain emits exactly one `wake-depth-exceeded`.
- Self-mentions are ignored. Non-members are refused the same way as a user mention (`wake-membership-denied`).
- Chain cancel is kept: `cancelWakeChain` cancels every wake in flight in the chain, and a cancelled chain never starts reply wakes again.
- Room replies carry `initiatorAgentId` and `lineage` (on the message and on the stream chunk), so Vale can show "via @Coder".

## Evidence (`npm run build`, then `node artifacts/verify-botos/reply-mention-wakes-harness.js`)
- Ping-pong between coder and assistant: replies `coder@1, assistant@2, coder@3, assistant@4`, then exactly **one** `depth-exceeded` at depth 5, all in the same chain
- Self-mention: only `selfie` replies, with no wake of itself
- Non-member `@outsider`: refused (`membership-denied`), and no reply from outsider
- Chain cancel at depth 2: only `coder@1` gets through, one `chain-cancelled`, and cancelling again is a no-op
- Failed parent (401): its lineage `{ depth: 3, chainId }` is still readable after the failure

The earlier harnesses (#55 chain cancel, #56 depth guard) still pass.

## Not in scope
- DMs and `requestAgentWake`: reply fan-out runs only on the ordered room path for now.
- The "via @Agent" and "Chain stopped" rows are Vale's Cancel-Chrome work.
