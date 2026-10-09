# ADR 0022 — Inclusive comparison predicates `at_most` / `at_least`

**Status:** Implemented 2026-10-09. Self-reviewed (Claude Code agent, model
`claude-opus-5-5`; no human or native-speaker review). Protocol
`lunum-protocol/0.5`, frames `lunum-frame/0.6`, agent contract
`lunum-agent/0.17`, instructions `agent-extraction-instructions/0.7`,
instruction package v19. Pre-registered bar:
[experiments/inclusive-bound-v1](../experiments/inclusive-bound-v1/PREREGISTRATION.md).

## Problem

`lunum-protocol/0.4` has only strict comparisons (`below`, `above`). ADR 0020
therefore told extractors to abstain on inclusive bounds (`up to`, `at most`,
Greek `έως`, `τουλάχιστον`), so round-2 item g02 (`Ο διευθυντής επιτρέπει στον
Νίκο να εγκρίνει δαπάνες έως 2.000 ευρώ.`) could never receive an identity, and
encoding it as `below` would claim a different meaning (2,000 itself excluded).

## Decision

- Protocol 0.5 registers `at_most` and `at_least`. No aliases: `up_to`,
  `max`, `min` stay unresolved, so a near-miss name is not silently mapped.
- Frames 0.6 give both the `below`/`above` frame: `subject` and `value`,
  required.
- Contract 0.17's threshold rule: a threshold that restricts a role is a
  `conditions` clause; strict → `below`/`above`, inclusive → `at_most`/
  `at_least`; never one for the other.
- The change is additive. The `lfp:2.1` projection, transport schema, literal
  retention and the existing frames are unchanged. Strict and inclusive bounds
  on the same value are different predicates, so they never share an identity.

## Evidence (bar)

1. Replay of every recorded candidate in the repository against the
   `origin/main` build (`scripts/research/replay-literal-retention-0020.mjs`,
   94 ledgers, 227 unique pairs): **180 identities before and after, 0
   withdrawn, 0 gained, 0 fingerprints changed**.
2. Existing golden vectors unchanged; new golden vectors in
   `packages/core/test/inclusive-bound.test.ts` (`at_most`
   `lfp:2.1:sha256:feeb215ffb2ca7c4876694c099cfd3b5`, `at_least`
   `lfp:2.1:sha256:4890e4e33c50a4c08c297f26e8f54be4`), all four comparisons
   distinct.
3. v18 and earlier packages stay frozen and are tested as historical: v18
   drifts exactly in `agent-native.js`, `frame-registry.js` and
   `semantic-registry.js`. Scoring manifest v6 and source review v5 rebind the
   unchanged historical bytes to 0.17 / protocol 0.5 / frames 0.6.
4. g02 as `allow` + `at_most` 2000 EUR receives identity; without the
   condition it is refused (literal retention). A new readiness mutation
   (`inclusive-bound-predicates-unregistered`) is caught.

## Not established

Core cannot tell strict from inclusive wording: a candidate that encodes `έως`
as `below` is still accepted. This is a presence floor, not meaning
verification. The live check is in
[experiments/inclusive-bound-v1/RESULTS.md](../experiments/inclusive-bound-v1/RESULTS.md).
