# Inclusive-bound predicate v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `5c9b62d` before implementation.
- **Change:** [ADR 0022](../../decisions/0022-inclusive-bound-predicates.md), commit `63d4d20`.
  - protocol 0.5, frames 0.6, contract 0.17;
  - frozen package v19.
- **Review:** self-reviewed by the authoring agent (Claude).

## Landing bar

| Condition | Result | Pass |
| --- | --- | --- |
| 1. No identity changes | Replay of 227 unique recorded candidates from 94 ledgers against the `origin/main` build: 180 identities before, 180 after; 0 withdrawn, 0 gained, 0 fingerprints changed | yes |
| 2. Existing golden vectors unchanged | All existing tests pass unchanged. New goldens: `at_most` `feeb215f…`, `at_least` `4890e4e3…`; the four comparisons are distinct | yes |
| 3. Frozen packages | No frozen file was edited. v18 is tested as historical and drifts exactly in `agent-native.js`, `frame-registry.js` and `semantic-registry.js`. Scoring manifest v6 and review v5 rebind the unchanged bytes | yes |
| 4. g02, deterministic check | `allow` + `at_most` 2000 EUR is issued; without the condition it is refused | yes |
| 5. `pnpm verify` | Green locally. CI: see the PR | yes (local) |

The freeze needed no extra permission.

## Optional live check (v19, `claude-sonnet-5`, $0.44 reported)

| id | source | outcome | identity |
| --- | --- | --- | --- |
| g02 | Ο διευθυντής επιτρέπει στον Νίκο να εγκρίνει δαπάνες έως 2.000 ευρώ. | `allow` + `at_most` 2000 euro | issued |
| e02u | The finance lead allows Omar to approve invoices up to 5,000 euros. | `allow` + `at_most` 5000 euros | issued |

**Pass.** Both items received identity with an `at_most` condition. g02 abstained by design under 0.16 and in the v17 live run.

The ledgers are in [live-v19/](live-v19/). The raw streams stay on the rig.

The two identities differ from each other, as they should. The ids are surface strings in each language (`διευθυντής` versus `finance lead`), so cross-language convergence is not claimed.

## Not established

Core cannot tell strict wording from inclusive wording. A candidate that encodes `έως` as `below` is still accepted. This is a presence floor, not meaning verification.
