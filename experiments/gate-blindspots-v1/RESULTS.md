# gate-blindspots-v1: results

**Scored 2026-11-12 at OpenLunum `311a5b6a`**: core built from `main`, with the literal-retention fix `2e5d246d`. Pre-registration: [PREREGISTRATION.md](PREREGISTRATION.md), committed before scoring. Output: [results.json](results.json). To reproduce: `node run.mjs --out results.json` after `pnpm --filter ./packages/core build`.

## Headline

**Every meaning-changing edit the pre-registration names gets an identity at least 89% of the time. Only removing a negation is caught.** The controls behave as designed: dropping a role or inserting a word not in the source is refused 96–99% of the time.

All 139 originals get an identity and are mutated. Every issued mutant has a fingerprint different from its original's (`sameFingerprint` 0 everywhere). So the gates do not merge the wrong meaning with the right one. They issue a separate, equally "valid" identity for it.

| Mutation | Applicable | Issued | Issued rate | Expectation | Refused because |
|---|---|---|---|---|---|
| M1 swap two role fillers | 139 | 139 | **100%** | ≥ 80%: held | none |
| M2 flip negation | 139 | 124 | **89.2%** | ≥ 80%: held | `unbound_source_content` 15 |
| M3 change modality | 139 | 139 | **100%** | ≥ 80%: held | none |
| M4 statement ↔ question | 139 | 139 | **100%** | ≥ 80%: held | none |
| C1 drop the last role (control) | 139 | 2 | 1.4% | ≤ 20%: held | `unbound_source_content` 78, `frame_noncanonical` 56, `unretained_source_literal` 3 |
| C2 insert a word not in the source (control) | 139 | 6 | 4.3% | ≤ 20%: held | `unbound_source_content` 132, `unretained_source_literal` 1 |

## What the breakdown shows (exploratory, not pre-registered)

- **Negation is caught in one direction only.**
  - Removing a stated negation (16 sources with `negated: true`) is refused 15 times: the source's "not" is left uncovered.
  - Adding a negation that the source does not state (123 sources) is **never** refused, because nothing checks that a negation has a source word.
- **The 8 issued controls are all legacy predicates** (`prefer`, `notify`, `request`, `before`; 6 of the 139 originals are legacy-only). That matches the fact check: a candidate made only of legacy frames is not source-bound at all.
- Predicates in the 139: `assert` 92, `describe` 24, `relate` 9, `define` 7, others 7.

## Reading

- The gates check that the words and literals are **present**. They do not check **who does what to whom** (M1), **added polarity** (M2, one direction), **modality** (M3) or **mood** (M4). Any of these errors in an extractor's output yields a valid-looking identity.
- This is the baseline for any role or scope gate. A candidate gate should bring M1–M4 down while keeping the originals' issue rate, measured against the human or judged faithfulness of the originals (coverage-a3-v2/v3).
- Two cheap, deterministic gaps are visible here:
  1. **Negation needs a source cue:** refuse `negated: true` when the source has no negation word. That is one direction of M2. It is a new gate, so a decision under ADR 0025 is needed.
  2. **Legacy-only candidates are not source-bound** at all.

  Neither is changed here.

## Limits

- The mutations are mechanical, so they bound the gates' sensitivity, not how often a real extractor makes these errors.
- The sources are 139 short English sentences; only one record has two clauses.
- M3 and M4 change fields the source might leave open (for example a modal the source implies without a word). The issued rate is still the gate's behaviour on a meaning change.
