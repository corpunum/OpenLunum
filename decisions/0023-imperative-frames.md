# ADR 0023: Imperative frames (deploy/rotate agent, deploy theme, restart count)

**Status:** Implemented 2026-10-09 and self-reviewed by the Claude Code agent
(model `claude-opus-5-5`). There has been no human or native-speaker review.

| Component | Version |
| --- | --- |
| Frames | `lunum-frame/0.7` |
| Agent contract | `lunum-agent/0.18` |
| Instructions | `agent-extraction-instructions/0.8` |
| Instruction package | v20 |
| Protocol | `lunum-protocol/0.5` (unchanged) |

Pre-registered bar:
[experiments/frame-gaps-v1](../experiments/frame-gaps-v1/PREREGISTRATION.md).

## Problem

The contract 0.16 live check
([results](../experiments/contract-0.16-live-check-v1/RESULTS.md)) missed three
of eight probes. Each miss was a correct abstention under `lunum-frame/0.6`:

- `deploy` required both `agent` and `destination`. "Deploy the billing patch
  by Friday." is an imperative, so it has no agent, and it names what is
  deployed rather than where.
- `rotate` required `agent`, so "Rotate the database credentials tomorrow."
  could not be encoded.
- `restart` had no `count` role, so "δύο φορές" could not be kept, and literal
  retention correctly refuses a candidate that drops it.

## Decision

**Frames 0.7:**
- `deploy`: `agent`, `theme` and `destination` are all optional, and at least
  one of `theme`/`destination` is required.
- `rotate`: `agent` is optional.
- `restart` gets its own frame: `theme` is required, and `agent` and `count`
  (quantity) are optional. This is the same shape as `retry`.

These are the same terms as decisions/0014, which already made the agent
optional in imperatives for `enable`, `delete`, `read`, `update` and others.

**Contract 0.18 rule:** an imperative's addressee is the implicit agent, so
leave `agent` out and never fill it with `you`, the reader or a placeholder. A
repetition count stated with the action goes in `roles.count` when the frame
has one.

**Scope:** the protocol vocabulary, transport schema, `lfp:2.1` projection and
literal retention are all unchanged. Every change either relaxes a required
role or adds an optional one, so every candidate that was valid before is still
valid and keeps its bytes.

## Evidence

Results against the bar are in
[experiments/frame-gaps-v1/RESULTS.md](../experiments/frame-gaps-v1/RESULTS.md).

## Not established

- **Implicit agents can split identities.** "Deploy X" (no agent) and "You
  deploy X" (agent `you`) get different identities. The rule tells extractors
  to leave the agent out, but core does not enforce it.
- **The probes are not held out.** They are the author-written sentences that
  exposed the gaps.
