# Independent re-evaluation (fixed SHA `a2909a3`)

**Evaluator:** a separate Claude Code session. It did not write the audited code or evidence, and it did not write the first evaluation.

It is the same vendor and model family as the author, so this is **not** a human or cross-vendor review.
- Evaluated commit: `a2909a3a048e556148e72ea10e335e65fd85d7ef`, detached checkout.
- No existing repository file was changed. This folder is the only write.
- The old build `008e320` was built in a separate worktree under `/tmp/eval2`.

Contents of this folder:

| Path | Content |
|---|---|
| `probes-authored.json`, `probes-authored.sha256` | 30 probes written before any repository file was read |
| `verify-summary.txt` | per-suite test totals from `pnpm verify` |
| `grader/` | adversarial grader cases and results; the regrade output; the dump script |
| `runner-binding/` | refusal output for v8; a package with its binding keys stripped, and its run summary; count of prompts sent to the fake CLI |
| `scan/` | output of the committed scan; my variant that locates each gained identity (`scan-where.mjs`); the pair-collision check |
| `live-oos/` | out-of-sample run: requests, expectations, run and candidate ledgers, summary, outcomes, fingerprints, raw streams |
| `live-insample/` | the same for 8 of the first evaluator's 24 probes |

Scripts reference absolute paths in `/tmp/eval2` and `/home/user/OpenLunum`.

---

## (a) Probe set

- **sha256 `942600af5b86dd68518ede07302253f4204a29f26fa9cab12f030cbbb6ce9614`**, recorded 2026-09-26T14:31:25Z.
  - This was before any repository file was opened, including the earlier REPORT.
  - The only repository text seen before then was `AGENTS.md`, which the harness injects into context.
  - Commit `a2909a3` is timestamped 14:30:23, one minute before the probes were hashed. I had not read it.
- **30 sentences: 20 English (e01–e20) and 10 Greek (g01–g10).**
  - 4 are expected to abstain: e07 "Revoke.", e12 "The team is allowed to approve.", e17 "Share it with them.", g06 "Ανακάλεσε."
  - 26 are expected to parse.
  - They cover permissions and prohibitions with and without a permitter, imperatives, the requested verbs, "polish" (no standard predicate), missing arguments, negation, thresholds, counts and dates.
  - They include two paraphrase pairs: P1 = e19/e20 ("can view" / "is allowed to read") and P2 = g09/g10.
- The expectations are my own, unchanged after reading. Where the contract disagrees, the miss is attributed below.

## (b) `pnpm verify`

**Pass, exit 0: 4,309 tests, 0 failed, 0 skipped, 0 cancelled** (18 suite blocks). Typecheck passed. The eval smoke run passed: 16 items, dataset `6a5dfd6e…`. (The earlier evaluation counted 4,306.)

## (c) Fix audit

| # | Claimed fix | Verdict | Evidence |
|---|---|---|---|
| a | **Grader v2** (`qa-grader.mjs`) | **FIXED for the reported hole; PARTIAL as a grader** | See below. |
| b | **MCP default reverted to `natural`** | **FIXED** | See below. |
| c | **Runner served-artifact binding** | **PARTIAL** | See below. |
| d | **ADR 0014 frame coverage and scan** | **Numbers CONFIRMED; interpretation partly overstated** | See below. |
| e | **Correction notes** | **Mostly accurate; PARTIAL** | See below. |

### (a) Grader v2 — FIXED for the reported hole; PARTIAL as a grader

**Re-grading reproduces amendment 1.** I copied every consumer run directory (16 runs) to `/tmp` and ran `regrade-consumer-qa.mjs`. My output is **byte-identical** to all 16 committed `summary-regraded.json` files. It reproduces decisions/0013 amendment 1 exactly:
- Haiku, contract-0.8 runs: harness dedup 20/19/19.
- Haiku, product-path runs: harness dedup 20/19/19; product-identity-dedup 20/20/19.
- Haiku natural-all: 20 in every run. Sonnet: unchanged.
- The "14" answer appears in 5 of 9 Haiku dedup condition-runs and 0 of 6 natural-all runs.

**Real recorded answers.** I read every answer v2 grades wrong, and every distinct answer v2 grades correct for q01, q02, q04, q05, q12–q14, q17, q18 and q20. I found **no mis-grade**:
- Every "14" is correctly wrong.
- Hedged correct answers pass, for example "Mira is allowed to access (the specific resource is not specified)" and "seven times (… with seven further attempts also mentioned …)".
- Every lunum-0.1 wrong answer is genuinely wrong.

**Latent weaknesses, from 46 synthetic answers** (`grader/grader-probe-results.json`):

*5 false positives:*
- A negation after the accepted token: "Access is denied", "access is not granted".
- "Nothing is known about access".
- "Mira is allowed to read files (no access info)".
- "No feature; F-11 is not mentioned".

*12 false negatives. A correct answer fails when it names the rejected alternative or adds any other number:*
- "20 percent (not 15)"
- "Required (not merely permitted)"
- "A-62 (not A-61)"
- "7 times, not 14"
- "7 retries, i.e. 1 initial attempt plus 7 retries"
- "30 EUR (the 45 EUR is from Q-83)"
- "The memory does not say." (for the yes/no question)
- "14 January 2027"

None of these occurred in the recorded runs, so the published numbers stand. The grader is still a token matcher, and it will mis-score a different model's phrasing.

### (b) MCP default — FIXED

- `packages/mcp/src/config.ts` defaults to `contextMode: 'natural'`, and `.mcp.json` sets `LUNUM_CONTEXT_MODE=natural`.
- All four integration guides use `natural`.
- The test `the MCP default context mode is natural (decisions/0013 amendment 1)` asserts it, and it passes in verify.
- The tool falls back to `config.contextMode`, and no source file sets `identity_dedup` as a default.

### (c) Runner served-artifact binding — PARTIAL

**What works:**
- `public-instruction-package-v8.json` with `--limit 1` exits with **code 3 before any model call**. It names `agent-native.js`, `frame-registry.js` and `tools.js` as mismatched.
- To prove that no model call happens, I ran all binding tests with a fake `claude` binary first on `PATH`. It received no prompt for the v8 run.
- v11 binds at start and end.
- Both of my real runs recorded `servedArtifactBinding.atStart/atEnd = true` and `observedContractVersions = ["lunum-agent/0.10"]`, with 0 items lacking an observed contract.

**Gaps:**
1. **Vacuous pass.** The check filters to the keys present in the package (`.filter(([key]) => pkg.freeze[key])`). A package without those four keys produces `checks: []`, and `[].every(...)` is true.
   - I stripped the keys from a v11 copy and also set a wrong `coreContractVersion` (`lunum-agent/0.3`).
   - The runner reported `atStart: true, atEnd: true, checks: []` and **proceeded to the model call**, which my fake CLI received.
   - The real v1 package has no `freeze` object and crashes with a TypeError; v2 and v3 lack `frameValidatorArtifactSha256`, so those are partially vacuous.
2. **Narrow scope.** Only 4 of the 94 served `.js` files are hashed. The package's own `launcherSha256` and `taskProfileSha256` are **not compared**: the profile hash is recorded, but a mismatched `--profile` is accepted.
3. **A mismatch after the run is only recorded.** A false `atEnd`, or a false `observedContractMatchesPackage`, does not fail the run.
4. **The ledger `contractHash` is still copied** from the request or package (`run-claude-code-source-only.mjs:191`). Only the contract *version* is observed, and only when the model happens to call `lunum_get_extraction_contract`.

### (d) ADR 0014 frame coverage and scan — numbers CONFIRMED; interpretation partly overstated

**The scan reproduces exactly:**
- `fingerprint-stability-scan.mjs 008e320 vs a2909a3`: total 4,562; **3,433 identical, 0 changed, 0 lost, 20 gained**.
- The earlier finding that the scan script was uncommitted is resolved.

**Where the 20 gains are.** My variant (`scan/scan-where.mjs`) locates them in four dataset files, all added between 2026-07-26 and 2026-09-07, well before this change:

| File | Gains |
|---|---|
| critical-semantic-differences-v1 | 6 |
| safety-critical-suites-v1 | 6 |
| scorer-eval-heldout-v1 | 7 |
| retention-expanded-v1 | 1 |

Their shapes are exactly as claimed: `run/approve/restart(agent, theme)`, `grant/revoke(agent, recipient, theme)`, `notify(agent, recipient, theme)`, `share(agent[, recipient], theme)` and `archive([agent,] theme)`.

**Pair collisions:** 13 pairs in the critical suite plus 6 in the safety suite have identity on both sides, which makes **19 pairs with 0 collisions**. Confirmed.

**Overstated:**
- **"Independent support for the chosen shapes."** These datasets were written in the same project, and the author could see them when choosing the frames, so they are not independent evidence.
- **"All 19 pairs … 0 collisions."** Only 19 of the 58 adversarial pairs have identity at all. For example, 37 of the 43 safety pairs are not tested.
- **The Limits section says** "use", "open" and "enter" still have no predicate and that "abstaining on them stays correct". Live, the extractor mapped all three to `access`, and none of them is in the alias table (see (d) below). So the ADR's stated behaviour does not hold in the product.
- **Retry was made agent-optional, but `grant`, `revoke` and `share` were given a *required* agent.** This recreates the old imperative-retry gap for "Grant Priya access …" (probe e06, which abstained for exactly this reason).

### (e) Correction notes — mostly accurate; PARTIAL

**Accurate:**
- The contract-0.8 note (V8 misses per rep; probes v3 not out-of-sample for the aliases; the exact-identity denominator) matches the ledger facts the earlier report gave.
- The consumer-0.8 note (Haiku natural-lunum-dedup 20/19/19; the per-rep savings) matches my regrade.
- The product-path note (20/20/19 and 20/19/19; 5 of 9 against 0 of 6) matches my regrade.
- The frame-0.2 note ("no verdict changed") matches my regrade: 0 changed.

**Incomplete or overstated:**
1. **The causal story.** The notes and amendment 1 say the error arises "always where extraction left two paraphrases of one event unmerged", and that "the wrong answers all come from one mechanism".
   - Correlation confirmed: every dedup context that produced "14" has 2 U-31 lines, and the 1-line contexts never did.
   - But the natural-all context contains the **same two unmerged English lines, plus a Greek third**, and Haiku answered 7 in all 6 of those runs.
   - So unmerged duplicates alone do not explain the error. The mechanism is a plausible hypothesis, not an established one.
2. **The contract-0.8 README body still says "Probes v3 (fresh)" and "The permission fix works … Fresh … sentences".** The prepended note corrects only the *alias* claim. The earlier finding that permitter-less permissions generalised 0/6 (row 7) is addressed in EVALUATION.md, not in this README.
3. **Row 6 is still undisclosed in the README table.** Two probe-v2 items were relabelled `either`.
4. **Stale open findings.** EVALUATION.md and STATUS.md (line 35) still list frame coverage and runtime binding as open, although `008e320` and `a2909a3` address them. This is stale rather than inflated.

## (d) Live results: package v11, contract `lunum-agent/0.10`, profile iteration 6

**Setup:**
- Claude Code 2.1.283, `--model sonnet`.
- The CLI reported models `claude-sonnet-5` and `claude-haiku-4-5-20251001`. Every item lists both; I presume the Haiku entry is the CLI's own auxiliary usage, but I did not verify this.
- Concurrency 4, code commit `a2909a3`.
- `servedArtifactBinding` was true at start and end in both runs, and `observedContractVersions` was `["lunum-agent/0.10"]`.

### Out-of-sample: my 30 probes

**Outcome score: 27/30.** 0 failed, 4 tool errors (calls to the disallowed `lunum_classify`), **$5.71**.

| Slice | Correct |
|---|---|
| expected abstain | 4/4 |
| expected parse | 23/26 |
| English | 17/20 |
| Greek | 10/10 |

**Convergence:** both paraphrase pairs got identical fingerprints: e19 = e20 = `…9311547…` and g09 = g10 = `…90b583…`.

**Outcome misses:**

| Probe | Sentence | Observed | Fault |
|---|---|---|---|
| e06 | Grant Priya access to the staging database until 30 November 2026. | abstain; the trace says "`grant` requires a stated `agent`" | **Contract.** ADR 0014 made `grant` agent-required, so imperative grants are unrepresentable. |
| e09 | Nobody except the auditor may delete audit logs. | abstain | **Contract**: no exception or exclusive-permission construct. Arguably my expectation. |
| e13 | Jonas should polish the onboarding slides before Friday. | abstain | **My expectation.** There is no predicate for "polish", and abstaining is correct under the contract. |

**Parse contents.** The outcome score counts every identity-bearing parse as correct. I read all 23 parses; **7 lose or change meaning**:

| Probe | Problem | Fault |
|---|---|---|
| e02 | "approve invoices **under 5,000 euros**" → `theme: invoices`. The threshold is dropped, so the permission is broadened. | Extractor. The contract also offers no obvious restriction slot. |
| g02 | "εγκρίνει δαπάνες **έως 2.000 ευρώ**" → `theme: expenses`. The threshold is dropped, and the names are translated (`director`, `Nikos`). | Extractor |
| e10 | "every night at 02:00" → `time: 02:00`. The recurrence is dropped. | Extractor; the contract has no recurrence and it should abstain |
| e11 | "**Send** three reminders before the deadline on 15 March" → **`retry`**(theme reminder, count 3), `time: "15 March"` (not ISO). This is the wrong predicate, "before the deadline" is lost, and core still issued an identity. | Extractor |
| g07 | "Αρχειοθέτησε τα 12 παλιά έργα **μέχρι τις 31 Δεκεμβρίου**" → `archive(theme: "12 old projects")`. The date is dropped, and the count is buried in a string. | Extractor |
| e18 | "The interns **may not** approve purchase orders" → `approve`, modality `permission`, `negated: true` | **Contract gap, plus the extractor** (see the note below) |
| g03 | "Απαγορεύεται … να κοινοποιούν …" → `share`, `permission`, `negated: true` | **Contract gap, plus the extractor** (same) |

**Prohibitions with no permitter have two encodings.**
- Across both runs there were 7 such prohibitions:
  - 4 were encoded as `obligation` + `negated` (e03, g08, p07, p20);
  - 3 as `permission` + `negated` (e18, g03, p08).
- The contract says `negated` means "NOT that predicate". Under that reading, `permission(NOT approve)` is "permitted not to approve", which is not a prohibition.
- Core accepts both encodings, and they get different identities. My check: `…7414a6…` against `…a756a0…` for the same sentence.
- This is the one-meaning/two-identities failure that ADR 0010 was written to remove, now for prohibitions. No ADR defines the permitter-less prohibition encoding.

**Literal retention is inconsistent in Greek:**
- g01, g08 and g09/g10 keep Greek ids.
- g02 (`director`, `Nikos`) and g04 (`mail_server`) translate them.

**Strict meaning-level score:** 16 faithful parses plus 4 correct abstentions = **20/30** (English 13/20, Greek 7/10).

### In-sample: 8 of the first evaluator's 24 probes

These are in-sample, because ADR 0014 was written after seeing them. Budget allowed only 8 items: the 5 that ADR 0014 targeted (p05, p19, p08, p13, p15) and the 3 coverage items (p06, p07, p20).

**Outcome: 8/8** against the first evaluator's expectations. 0 failed, 0 tool errors, **$1.52**.

**Clean (4):**
- p05 and p19: `read` with modality permission.
- p13: "Start the backup job" → `run`.
- p15: imperative `retry`, count 3, date 2026-10-05.

**Parsed, but with problems (4):**
- **p06** "use the lobby printer", **p07** "open the server cabinet" and **p20** "μπαίνουν στο εργαστήριο" (enter) all became **`access`**.
  - None of use, open or enter is in the alias table (`view/see/inspect/browse→read`, `execute/launch→run`, …).
  - The extractor chose the mapping itself, which contradicts ADR 0014's Limits section.
  - Whether "open the cabinet" means "access the cabinet" is an unreviewed semantic judgement.
  - p20 also translated its Greek literals (`visitors`, `lab`).
- **p08** "Tom is not allowed to approve …" → `permission` + `negated`: the prohibition-encoding problem above.

**Strict meaning-level score: 4/8.**

### V8

**Not run.** The budget was exhausted: the two runs cost $7.23, and V8 is about 24 items at roughly $0.19 per item. The remaining 16 in-sample probes were not run for the same reason.

## (e) Cost

| Item | Cost |
|---|---|
| Out-of-sample live run (30 items) | $5.7100 |
| In-sample live run (8 items) | $1.5187 |
| Runner binding tests | $0 (a fake CLI; no model call) |
| Grader, regrade and scan work | $0 (local) |
| **Total** | **$7.23**, within the ~$8 budget |

Cost per item was about $0.19, against $0.094 in the first evaluation's run.

## (f) Verdict

**Fixed and verified:**
- The substring hole in the grader. The re-grade reproduces byte-for-byte, and no mis-grade was found in the real answers.
- The MCP default is back to `natural`, with a test.
- The runner refuses a mismatched v8 build before any model call.
- The fingerprint scan is committed and reproduces exactly: 3,433 / 0 / 20.
- The 0-collision claim holds for the 19 testable pairs.
- The frame additions work for the verbs they target:
  - permitter-less permissions with `read` and `approve` now parse;
  - the imperatives `run`, `restart`, `archive` and `retry` now parse;
  - both of my paraphrase pairs converge.
- Out-of-sample, the outcome score is **27/30**, up from the first evaluation's 13/24 on different sentences.

**Still overstated or open:**
1. **Outcome scores overstate meaning fidelity.** A "parse with identity" is scored correct even when the meaning is wrong or truncated.
   - Out-of-sample, 7 of 23 parses dropped a threshold, date or recurrence, or used the wrong predicate (send→retry). All of them received a stable identity.
   - Meaning-level: 20/30 out-of-sample, 4/8 in-sample.
   - An identity that silently drops "under 5,000 euros" from a permission is worse than an abstention. The project's scorers for probe sets do not detect this.
2. **Prohibitions with no permitter split between two identities**: 4 as `obligation` + negated, and 3 as `permission` + negated. The latter contradicts the contract's own negation rule. This is a convergence failure of the kind ADR 0010 was meant to prevent. It needs a contract decision.
3. **ADR 0014 left imperative `grant`/`revoke`/`share` unrepresentable**, the same class as the retry gap it fixed. Its "abstain on use/open/enter stays correct" statement is contradicted by the live extractor, which maps them to `access` without an alias.
4. **Runner binding can pass vacuously** for a package without the hash keys. It ignores the launcher and profile hashes, and it covers 4 of 94 served files. Mismatches after the run and on the contract version are only recorded.
5. **Grader v2 is still a token matcher**, with realistic latent false negatives (answers that name the rejected alternative) and false positives (a negation after the token).
6. **The amendment-1 causal story is stronger than the data.** The natural-all control contains the same unmerged paraphrases, and it produced no errors.
7. **Stale or unretracted text:**
   - the contract-0.8 README body ("fix works", "fresh");
   - the undisclosed v2 relabelling;
   - EVALUATION.md and STATUS.md listing fixed items as open.

**Bottom line.** The specific defects the first evaluation reported have mostly been fixed honestly, and the published numbers now reproduce. The project's own scoring still measures parse-or-abstain, not meaning. At that level the fresh-sentence picture is noticeably worse: roughly two thirds faithful, with confident wrong identities, and the output needs a meaning-level check before any claim of fidelity on ordinary input.

*Self-limitation:* this is a single AI session, from the same model family as the author, with no human or native-speaker review. The Greek judgements and the parse-content judgements are my own. The in-sample check covers only 8 of 24 items, and V8 was not re-run.
