# Fact check: gpt-6-luna review, 2026-11-12

The review is [gpt-6-luna-2026-11-12.md](gpt-6-luna-2026-11-12.md), at OpenLunum `37f3254c`. Every factual claim in its sections 1, 2 and 4, plus the premises in section 3, was checked against the full repository. Recommendations were not checked.

The check was run by an Opus subagent of s-openlunum, read-only. `packages/core/src` is unchanged between `37f3254c` and `9894442e`. Probes ran against `packages/core/dist`, which was built after the last source change. s-openlunum re-checked items 2b, 4.2 and 4.6 independently.

## Verdict on the review

- Its facts hold up. 23 claims were confirmed, 3 are partly right and none is refuted outright.
- Its new criticism is right: **the gates check that words and literals are present, not that they sit in the right role or scope.** Every probe below gets an identity.
- Six numbers it marked "not checkable" (the small bundle left them out) are confirmed by the full repository. A seventh, the README's Rust parity counts, was out of date. It is corrected in the same commit as this file.

## Claims

| # | Claim | Label | Evidence |
|---|---|---|---|
| 1a | Rust matches TypeScript on 7,089 identity vectors and 10,522 renderer vectors | **Out of date** | The golden files at `37f3254c` hold 8,118 and 12,030 entries; they were regenerated at `e80193fc` and `0cdd54a9`. The Rust golden tests iterate every entry and fail on any mismatch (`crates/lunum-sem/tests/golden.rs`, `crates/lunum-render/tests/golden.rs:98`). The last Rust CI run, at `0d16cba8` (2026-10-23), is green. README corrected. |
| 1b–c | 49/49 fresh records; judges 48/49 lenient and 33/49 strict; 49 of 200 got records | Confirmed in repo | `experiments/roundtrip-en-v1/RESULTS.md:9,23,31-32` |
| 1d | recall@5 0.405 → 0.800 | Confirmed | `experiments/source-locator-v1/RESULTS.md:26,28` |
| 1e | Greek fold 0.283 → 0.992; composite 0.883 | Confirmed | `experiments/greek-fold-recall-v1/RESULTS.md:23-24,30` |
| 1f | discourse 0.56x; 20.3% → 37.1%; no point worse | Confirmed in repo | `experiments/discourse-live-gate-v1/RESULTS.md:24,28,32` |
| 1g | Greek 0/50, English 9/50 | Confirmed in repo | `experiments/greek-frames-heldout-v1/RESULTS-baseline.md:18` |
| 1h | 0 identities over 21,291 units | Confirmed | `experiments/discourse-unit-identity-v1/RESULTS.md:75` |
| 1i | v17: 7/12, the first seven from a run that failed its evidence gate | Confirmed | `reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md:16,52,77-78` |
| 1j | coverage-a3-v2: 69.5% coverage, 56% judged meaning | Confirmed in repo | `experiments/coverage-a3-v2/RESULTS.md:9-10` |
| 1k | cache-aware compaction 0.98x against a 0.80x bar | Confirmed in repo | `experiments/cache-aware-compaction-v1/RESULTS.md:3,5` (a chars/4 estimate) |
| 2a | The 3.2% ceiling is loose, mostly restatements handled by kv supersession | Confirmed | `discourse-unit-identity-v1/RESULTS.md:50,53` |
| 2b | Source binding checks word occurrence, not roles | Confirmed | `packages/core/src/source-bound.ts:130-137` pools the fillers of all roles. Probe: source "Alice pays Bob.", with subject Bob and object Alice, gets an identity. |
| 2c | "Omar may not approve invoices" with the wrong scope can pass | Confirmed | The only modality/negation placement gate is permission + negated (`frame-registry.ts:524-525`). Probes on approve(Omar, invoices) with negated=true: `obligation` gets an identity (correct); `possibility` gets one (wrong); `may` placed in `manner` gets one (the review's scenario). |
| 2d | Literal retention is a presence check | Confirmed | `literal-retention.ts:378-391`; `experiments/inclusive-bound-v1/RESULTS.md:36` |
| 3a | "fast" and "quick" may have distinct identities | Confirmed | `decisions/0024-general-source-bound-frames.md:104-105` |
| 3b | Cross-language convergence 0/5 | Confirmed | `README.md` |
| 4.1 | The identity projection keeps kind, term type, and id versus value | Confirmed | `fingerprint.ts:33-39,81`; v17 shows splits on kind (e03, e08, e14), term type (e16) and id versus value (g04) |
| 4.2 | Source binding skips the uncovered-word check whenever any clause is non-general | **Partly** | Mixed candidates: true (`source-bound.ts:117,155`). Pure-legacy candidates are not source-bound at all (`:123`, `applies: false`), so even the filler-occurrence check does not run. Both are pinned as intended in `test/general-frames.test.ts:165-173`. |
| 4.3 | `value` is not normalized | **Partly** | `canonicalizeSem` applies NFKC, trim and whitespace collapse to value strings before projection (`canonicalize.ts:34-35,52`). Only identifier-style lowercasing is missing. |
| 4.4 | Literal retention compares sets | Confirmed | `literal-retention.ts:383,386`. Probe: "retry twice, then retry twice" with one quantity 2 → `retained: true`. |
| 4.5 | Literals are matched anywhere, not to a role | Confirmed | `literal-retention.ts:360-367,378` |
| 4.6 | The number-word table lacks "one" and 21–29 | **Confirmed and understated** | `one` is deliberately absent (`:159`), so `numbersInText('twenty-one')` returns `[20]` and `'one hundred'` returns `[]`; twenty-two to twenty-nine do compose. A candidate carrying 20 for "twenty-one" passes, and a correct one carrying 21 is refused as missing 20. No test covers twenty-one or one hundred. |
| 4.7 | Ordinals excluded | Confirmed | `literal-retention.ts:161`; `test/relative-time-number-word-retention.test.ts:55` |
| 4.8 | Relative time is pattern-based | Confirmed | `literal-retention.ts:280-343` |
| 4.9 | One filler covers every occurrence of its words | Confirmed | `source-bound.ts:134-136`. Probe: "the cache is fast and the cache is fast" with one describe clause → bound. |
| 4.10 | Uncovered digits are allowed; the closed-word list is small and English-only | Confirmed | `source-bound.ts:30-36,157`; non-English sources fail closed (`:124`) |

## Where it disagrees with the Claude reviews

- The Fable review called general frames source-bound rather than paraphrase-invariant. This review goes further: being source-bound does not mean being faithful, because role, scope and attachment are unchecked. No Claude review stated that, and no test covers it.
- On the identity thesis it agrees with the Fable review.

## Not acted on here

- **The "twenty-one" misreading is a defect in a gate, not a design limit.** Fixing it changes which candidates get identities, so it goes to the orchestrator as a decision (ADR 0025 freeze). OpenUnum's vendored core (`5f6570bf`) has the same code.
- Role, scope and multiplicity checks would be new gates. They belong to a pre-registered experiment, for example the review's experiment 1, not to a patch.
