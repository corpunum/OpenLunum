# Frame gaps v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `d4a7384`
  before the implementation and before any provider call.
- **Change:** [ADR 0023](../../decisions/0023-imperative-frames.md), commit
  `dfa7c57`. Frames 0.7, contract 0.18, frozen package v20.
- **Review:** self-reviewed by the authoring agent (Claude). There has been no
  human or native-speaker review.

## Landing bar

| Condition | Result | Pass |
| --- | --- | --- |
| 1. No existing identity changes | Replay of 229 unique recorded candidates from 96 ledgers against the `origin/main` (539c708) build: 182 identities before and 182 after. 0 withdrawn, 0 gained, 0 fingerprints changed. | yes |
| 2. Existing golden vectors unchanged | All existing tests pass unchanged. The old `deploy(agent, destination)` shape is pinned to `f8152639…`, computed with the frames 0.5 build. New goldens for r1/r2/r6, plus r6 without its count, are all distinct. | yes |
| 3. Frozen packages | No frozen file was edited. v19 is tested as historical and drifts exactly in `agent-native.js` and `frame-registry.js` (served contract: version, hashes, frame registry). v18 and earlier still drift as before. Scoring manifest v7 and source review v6 rebind the unchanged bytes. | yes |
| 4. Deterministic probes | r1 (deploy + theme + Friday), r2 (rotate, no agent) and r6 (restart S-12, count 2) receive identity. The negative twins are refused: r1 without Friday and r6 without the count (literal retention), and a deploy with neither theme nor destination (frame). A new readiness mutation (`deploy-target-requirement-dropped`) is caught. | yes |
| 5. `pnpm verify` | `pnpm test` is green locally. CI: see the PR. | yes (local) |

## Live check (v20, `claude-sonnet-5`, Claude Code 2.1.295)

| id | source | 0.16 check (v18) | 0.18 check (v20) | identity |
| --- | --- | --- | --- | --- |
| r1 | Deploy the billing patch by Friday. | abstain (frame) | `deploy`, theme billing patch, weekday Friday | issued |
| r2 | Rotate the database credentials tomorrow. | abstain (frame) | `rotate`, theme database credentials, time tomorrow | issued |
| r3 | Retry the nightly export job three times. | identity | `retry`, count 3 | issued |
| r4 | Archive report R-7 next week. | identity | `archive` R-7, next week | issued |
| r5 | Ενημέρωσε την ομάδα υποστήριξης αύριο. | identity | `notify` ομάδα υποστήριξης, αύριο | issued |
| r6 | Επανεκκίνησε τον διακομιστή S-12 δύο φορές. | abstain (frame) | `restart` S-12, count 2 | issued (= the hand-built golden `5b28c052…`) |
| r7 | Η αναφορά R-9 λήγει την Παρασκευή. | identity | `deadline` R-9, Παρασκευή | issued |
| r8 | Notify the on-call team if the error count goes above twenty. | identity | `notify` + `above` 20 | issued |

**Pass: 8 of 8** (bar: at least 7, including at least 2 of r1/r2/r6; all 3
were recovered).
- No candidate resolved a relative time or stored a different count.
- No candidate filled the agent of an imperative.
- Evidence is valid: preflight and served-artifact binding held at start and
  end, and there were 0 tool errors.

### Cost and one deviation

The `--limit 1` pilot (r1, $0.25 ceiling) failed with `ITEM_BUDGET_EXCEEDED`.
The cold first call paid about 54k tokens of cache creation, for $0.27
reported, and returned no outcome. That pilot is kept in [pilot/](pilot/) and
counts toward spend.

To stay within the pre-registered $2.00 total, the full run used $0.21 per
item ($1.68 reserved) instead of $0.25. Every item finished under that ceiling
(max $0.167).

**Total spend: $1.49** ($0.27 pilot + $1.22 run).

The ledgers are in [live-v20/](live-v20/). The raw streams stay on the rig.

## Not established

- **Not held out.** These are the same eight author-written sentences that
  exposed the gaps. Passing shows that the gaps are closed, not that the
  frames generalise.
- **Agent omission is a rule, not enforced.** "You deploy X" (agent `you`)
  would still get a different identity from "Deploy X". Core does not enforce
  the rule.
