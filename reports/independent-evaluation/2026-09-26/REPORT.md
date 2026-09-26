# Independent evaluation of the 2026-09-26 evidence (fixed SHA `7657cab`)

**Evaluator:** a separate Claude Code session. It did not write the audited code or evidence, but it comes from the same vendor and model family as the author, so it is not a human or cross-vendor review. Evaluated commit: `7657cab3d1be3d51fbebfccfc48265f6c2f9e5bc` (detached checkout). No repository file was changed. This folder is the only write.

Scratch data lives in `/tmp/eval`. The files in this folder:

| Path | Content |
|---|---|
| `probes-authored.json`, `probes-authored.sha256` | the probe set, hashed before any repository file was read |
| `verify-summary.txt` | test totals extracted from `pnpm verify` |
| `recompute/` | recomputed V8 summaries (items stripped) and probe outcomes, contract-0.8 reps 1–3 |
| `scan/` | my fingerprint-stability scan script and its summary |
| `live/` | requests, expectations, `run-summary.json`, `run-ledger.jsonl`, `candidate-ledger.jsonl`, `outcomes.json`, raw streams |

---

## (a) Probe set, authored before reading the repository

- sha256 of `probes-authored.json`: **`cfd5663a029c6a98284f93fe775b9a685cb3e93f2d84e2ab0bfa029c1a949c73`**, recorded 2026-09-26 13:50:24 UTC, before any repository file was opened. The only repository text seen before that point was `AGENTS.md`, which the harness injects into context.
- 24 sentences: 16 English and 8 Greek. 8 are expected to abstain and 16 to parse. Categories:
  - missing arguments (p01, p02, p17);
  - a permission or prohibition with a permitter and a bare verb (p03, p04, p18);
  - a permission or prohibition with no permitter (p05–p08, p19, p20);
  - verbs with no plausible predicate (p09, p10);
  - synonyms (p11–p13, p21);
  - complete statements (p14–p16, p22–p24).

The expectations came from my own reading of the sentences, without knowledge of the contract. Some of them conflict with owner decisions I read afterwards (see (d)). I did not change them after reading the repository.

## (b) `pnpm verify`

**Pass, exit 0.** 4,306 tests, 0 failed, 0 skipped:

| Suite | Tests |
|---|---|
| core | 1,824 |
| eval | 1,892 |
| api | 202 |
| cli | 189 |
| mcp | 62 + 2 |
| adapter-openunum | 45 |
| root script suites | 90 |

Typecheck passed. The eval smoke run passed: 16 items, dataset `6a5dfd6e…`.

## (c) Audit, claim by claim

Scopes: `reports/diagnostic/2026-09-26/{EVALUATION.md, contract-0.8, consumer-qa-v1-contract-0.8, consumer-qa-v1-product-path}` and `decisions/0007–0013`.

**Method note:** the prescribed scorer path prefix `../../` is one level short, because the ledger path resolves relative to `experiments/natural-development-v8/frame-0.2-successor`. I used `../../../`.

| # | Claim (where) | Verdict | Evidence |
|---|---|---|---|
| 1 | V8 source-relative 19/19/19 of 21 (contract-0.8 README, EVALUATION) | **CONFIRMED** | The frozen scorer reproduces 19, 19, 19. The recomputed `items` are byte-identical to the committed `results.json` in all three reps. Ledger sha256 values match. |
| 2 | V8 exact/comparable 16/16, 17/17, 17/17 | **CONFIRMED, with a denominator caveat** | Numbers reproduce. But 4–5 of the 21 parse targets are never in the "exact" denominator: the scorer drops any item whose literals are not verbatim source substrings (`sourceAnchoredLiteralIdentity`). That excludes the whole date/number-normalised retry group g6 (3 items), plus g2-en-a. "16/16" reads as perfect, but exact identity is only tested on items that need no normalisation. |
| 3 | V8 abstentions 3/3 every rep | **CONFIRMED** | |
| 4 | V8 g2-en-b ("is permitted to activate") falsely refused in all 3 reps | **CONFIRMED** | Declared abstain in reps 1–3. |
| 5 | "The remaining V8 misses are a false abstention … and a persistent typing miss"; "g6-en-b … typed `identifier` … in 2 of 3 repetitions" | **DISCREPANCY** | The actual source-relative mismatches differ from the claim. **Rep 1:** g6-en-b matched; the miss was **g2-en-a with `world: "tool"`** instead of `real`. **Rep 2:** g6-en-b had theme `identifier` **and** count unit `times`→`attempts`. **Rep 3:** g6-en-b had theme typed `task` (correct), and the miss was unit `attempts` only. The identifier typing error occurs in **1 of 3** reps, not 2 of 3, and one rep's miss is a different item and error class that the README does not mention. |
| 6 | Probes v1 20/20, v2 18/18, v3 16/16 in every rep | **CONFIRMED** | `score-probe-outcomes.mjs` reproduces all 9 runs. The committed v3 `outcomes.json` is byte-identical to the recomputation. Probes v2 have 20 items; 2 prohibit items were relabelled `either` by `private-expectations-frame-0.2.jsonl` (added at `1eaad78`, after decisions/0008). Both were observed as abstain, which was their original expectation, so the exclusion does not inflate the score. It is not mentioned in the README table, though. |
| 7 | "The permission fix works. … Fresh 'is permitted to' / επιτρέπεται / 'may' sentences … parsed with identity in every repetition" | **CONFIRMED as stated, UNSUPPORTED as a general claim** | All four permitter-less v3 items use **framed** predicates (send, enable ×2, publish). Only 23 predicates are framed. `read`, `run`, `update`, `access` and `approve` are registered but unframed, and core rejects them as clause heads. Under decisions/0010 a permitter-less permission must go on the action's own frame, so it is unrepresentable for every verb outside those 23. Live result: **0/6** permitter-less permissions or prohibitions parsed (read ×2, use, open, approve, enter). |
| 8 | "The verb aliases work … including the fresh v3 verbs (modify, remove, execute, inspect)" | **UNSUPPORTED as out-of-sample** | `experiments/probes-v3/private-expectations.jsonl` was committed at 11:57 (`7d3dbb7`). The alias table was committed at 12:00 (`c89e7c6`), by the same author, and contains exactly those four verbs. The v3 alias results show a table lookup of verbs the author had just chosen as test items, not generalisation. ADR 0011 discloses "same author" but still calls v3 fresh. Probes v4, the intended out-of-table test, have **no run** at this SHA. |
| 9 | 0 run failures; 12 runs at `c89e7c6`, tree clean; cost $23.71 | **CONFIRMED** | `failed=0` in all 12 run summaries; the sum is $23.70 from rounded values. Not mentioned: 8 `toolErrors`, all builder validation rejections, plus attempts to call the non-allowed `lunum_classify`. |
| 10 | Provenance: `dist` rebuilt from uncommitted work for about a minute during V8 rep 1 | **CONFIRMED as disclosed; it exposes a design weakness** | The runner's "clean tree" check covers **tracked files only**. `dist/` is untracked, and the runner never hashes the served artifacts against the package. The ledger `contractHash` is **copied from the request or package** (`run-claude-code-source-only.mjs:171`), not observed from the live server. The package binding is therefore an assertion, not a measurement. The disclosed incident shows the gap is real. |
| 11 | Consumer (contract-0.8): natural-lunum-dedup −60% Sonnet, −62% Haiku | **CONFIRMED (pooled)** | Tokens pooled over 3 reps give −59.7% and −62.5%. The per-rep spread is −55/−62/−62 (Sonnet) and −56/−66/−66 (Haiku). Rep 1 saves less and is not shown. |
| 12 | Consumer (contract-0.8): natural-lunum-dedup keeps **20/20/20 for both models** | **DISCREPANCY (Haiku)** | The grader accepted **"14 times (7 retries …, plus 7 further attempts …)"** for q14 ("How many times does Rhea retry U-31?"), because `accept: ["7","seven"]` is a substring test. This happened in Haiku reps 2 and 3. Corrected Haiku result: **20/19/19**. |
| 13 | Product path: product-identity-dedup Haiku 20/20/20; harness dedup Haiku 20/19/20; the q14 "14" is "a single observation, not a rate" | **DISCREPANCY** | Two more false positives in Haiku rep 3, one per condition. Corrected: **product-identity-dedup 20/20/19**, **natural-lunum-dedup 20/19/19**. A "14" answer occurred in **5 of 9** Haiku dedup condition-runs across both reports, against **0 of 6** Haiku natural-all runs. It appears only in reps 2 and 3, the reps whose extraction failed to merge g6-en-b (see row 5). This is a repeatable, extraction-caused error, not a single observation. Sonnet had none. |
| 14 | ADR 0013: identity_dedup "kept 20/20 answers at … −62% (`claude-haiku-4-5`)"; the MCP default was switched on this basis | **DISCREPANCY** | Same as rows 12–13. The MCP server default was changed on evidence that, once correctly graded, shows the dedup context causes wrong answers for Haiku while the full natural context does not. |
| 15 | Consumer benchmark independence | **UNSUPPORTED as a quality claim beyond V8** | The memory corpus *is* the 24 V8 sentences (8 paraphrase groups) that the contract and profile were iterated on. Both extraction and dedup are in-sample. The 20 questions were written by the same author and graded by substring. The README discloses "paraphrase-built" and "self-authored". |
| 16 | Grader robustness (`consumer-memory-qa.mjs`) | **WEAKNESS CONFIRMED** | `correct = accept.some(includes) && !reject.some(includes)`. Realised: 4 false positives (q14). Latent: q20 accepts `"no"`, which is a substring of "unknown", "not" and "none", so an "unknown" answer would score correct. q17 accepts `"access"`, which also matches "cannot access". q14 accepts `"7"`, which also matches "17". |
| 17 | ADR 0011 amendment: fingerprinting before/after 0.9 gives 3,192 identities byte-identical, none changed | **CONFIRMED in substance; not reproducible as stated** | I scanned every Sem-like object in the tracked JSON/JSONL files (`scan/scan.mjs`) with the builds of `608606c` and `7657cab`: **3,214 identical, 0 changed, 0 gained, 0 lost**. The count differs because the scans have different scopes. The author's scan script is not committed, so their exact figure cannot be re-derived. The same applies to the 2,859 (EVALUATION), 2,711 / 135 (ADR 0007), 3,022 / 1,942 / 41 (ADR 0008) and 2,464 / 49 (ADR 0010) figures. |
| 18 | Package v10 hash bindings | **CONFIRMED** | These match the built files: `agent-native.js` 7caa341c, `lunum-mcp.js` a53c1907, `tools.js` 87f0ff84, `frame-registry.js` 30d2a656, the scorer 85c74b13, the task contract 84ea2a1e, the profile iteration 6 50a81918, and the launcher (`scripts/lunum-mcp-launch.mjs`) 9b35bc92. They still matched after my live run's rebuild. |
| 19 | ADR 0010: no run produced the allow-with-permitted-party encoding | **CONFIRMED** | 60 allow/prohibit clauses in the 12 contract-0.8 ledgers; 0 have `action` with a missing or identical recipient. |
| 20 | ADR 0011: aliases (inspect/see/browse→read, change/amend→update, remove→delete, …) are "clear near-synonyms" | **UNSUPPORTED (semantic judgement, unreviewed)** | This is a vocabulary merge that gives "inspect the ledger" and "read the ledger" one identity. It is self-reviewed and cannot be decided mechanically. It needs a human decision, as AGENTS.md requires for such judgements. |

Not audited: runs v3–v5, frame-0.2 and consumer-qa-v1 (the frame-0.2 ledgers). Their figures in EVALUATION.md were not recomputed.

## (d) Live results: package v10, contract `lunum-agent/0.9`, profile iteration 6

Setup: Claude Code 2.1.283, `claude-sonnet-5` served, 24 items, concurrency 4. Result: 0 failed, 2 tool errors, **$2.2499**.

**13/24 against my expectations.**

| Expected | n | Correct |
|---|---|---|
| abstain | 8 | 5 |
| parse | 16 | 8 |

By language: English 8/16, Greek 5/8.

| Probe | Sentence | Exp | Observed (candidate or reason) | Fault |
|---|---|---|---|---|
| p03 | Marta allows Jonas to edit. | abstain | parse `allow(agent Marta, recipient Jonas, action update)` | **My expectation.** decisions/0008 (owner decision) makes verb-only permissions parse. |
| p04 | The admin forbids Sam to delete. | abstain | parse `prohibit(admin, Sam, action delete)` | **My expectation**, same as p03. |
| p18 | Η Άννα επιτρέπει στον Γιώργο να επεξεργαστεί. | abstain | parse `allow(Άννα, Γιώργος, action update)` | **My expectation**, same as p03. |
| p05 | Nadia is permitted to read the payroll report. | parse | abstain: "`read` is registered but not framed" | **Contract.** `read` is unframed. The same meaning *with* a permitter ("X allows Nadia to read R") parses. |
| p19 | Η Ελένη επιτρέπεται να διαβάσει το συμβόλαιο. | parse | abstain (same reason) | **Contract**, same gap as p05. |
| p08 | Tom is not allowed to approve his own expenses. | parse | abstain: `approve` unframed | **Contract.** |
| p13 | Start the backup job. | parse | abstain: start→`run`, and `run` is unframed | **Contract.** `run` is usable only as an `action` alias. |
| p06 | Guests may use the lobby printer. | parse | abstain: no predicate for "use" | **Contract coverage.** Abstaining is correct under the contract. |
| p07 | Contractors must not open the server cabinet. | parse | abstain: "open" has no predicate | **Contract coverage.** "open" was deliberately left out (ADR 0011). |
| p20 | Οι επισκέπτες δεν πρέπει να μπαίνουν στο εργαστήριο. | parse | abstain | **Contract coverage** ("enter"). |
| p15 | Retry the upload 3 times on 2026-10-05. | parse | abstain: `retry` requires `agent` | **Contract.** `retry` requires an agent. The imperatives for enable, disable and delete (agent optional) parsed, so an imperative retry is unrepresentable. |

**Correct items (13):**
- Missing-argument refusals: p01, p02, p17.
- Nonce and figurative verbs refused: p09, p10.
- Synonyms parsed: switch on→`enable` (p11), wipe→`delete` (p12), άναψε→`enable` (p21).
- Complete statements parsed: p14, p16, p22, p23, p24, including both battery conditionals, with the threshold as a quantity in percent.

**Attribution:** I judge all 11 misses to be contract or expectation faults, not extractor faults. The extractor's stated reasons matched the registry each time; I checked `CANONICAL_SEMANTIC_FRAMES` directly.

**Extractor quality notes, outside the outcome score:**
- p21 translated a Greek literal into English (`value: "kitchen lights"`), while p23 kept Greek (`"ειδοποιήσεις για το ημερολόγιο"`).
- p22 used Greek common nouns as ids (`αναφορά`, `ιστολόγιο`).

Cross-language identity of free-text terms therefore depends on whether the extractor happens to translate. That undermines the multilingual-convergence story for any term without an ID code.

**What the live run shows about the contract:**
1. There is an asymmetry introduced by ADRs 0008 and 0010.
   - With a permitter, the `action` vocabulary covers every registered predicate, including `read`, `run`, `update` and `access`.
   - Without a permitter, a permission must use the action's own frame, and only 23 predicates have one.
   - So "A allows B to read R" parses, but "B is permitted to read R" and "B may read R" cannot.
   - The contract-0.8 evidence did not detect this, because every permitter-less probe used a framed verb.
2. The rate of permitter-less permissions and prohibitions in ordinary wording is poor: **0/6** here, against the reported 4/4 (×3) on probes v3.

## (e) Model cost

| Item | Cost |
|---|---|
| Live probe run | **$2.25** (from `run-summary.json`) |
| Other model calls | none |
| **Total** | **$2.25**, within the $6 budget |

## (f) Verdict

**What the evidence establishes:**
- The code builds and its 4,306 tests pass.
- The committed V8 and probe scores are **faithfully reproducible** from the committed ledgers with the committed scorers: all 12 contract-0.8 runs match exactly.
- Package v10's hash bindings match the build.
- The contract-0.9 alias change moved no existing fingerprint. I confirmed this with my own scan.
- On V8's 24 sentences and the author's own probe sets, Claude Code with `claude-sonnet-5` reliably refuses the tested missing-argument sentences, and it parses fully specified sentences built from framed predicates and ID-coded entities.

**What it does not establish, and where it overstates:**
1. **Generalisation.** Almost every favourable result is in-sample:
   - V8 was iterated on;
   - probes v1 and v2 motivated the changes;
   - probes v3 verbs were placed into the alias table three minutes after v3 was frozen;
   - the consumer memory corpus *is* V8.

   The one set meant to test generalisation (probes v4) was never run. My fresh 24 sentences in ordinary wording scored 13/24 against naive expectations. Of the 16 sentences a user would expect to be representable, only 8 parsed.
2. **Coverage.** The contract can represent only 23 predicates as clause heads, and permitter-less permissions are limited to those. The reported "permission fix works" holds only inside that vocabulary.
3. **The consumer-quality claim behind ADR 0013 is wrong for Haiku.** It stands only because of a substring-grading bug.
   - Correctly graded, identity-dedup memory produced a wrong count (14 instead of 7) in 5 of 9 Haiku dedup condition-runs, against 0 of 6 with the full natural memory.
   - The error tracks the reps where extraction failed to merge a paraphrase.
   - "Keeps every answer" is false for one of the two models, and the MCP default was changed on that claim.
4. **Narrative accuracy.** The README's explanation of the remaining V8 misses does not match the ledgers (row 5).
5. **Provenance.** The runner does not verify that the served build matches the package it records, so run-level binding rests on process discipline, not measurement.
6. **Reproducibility.** The repo-wide identity-stability figures in ADRs 0007, 0008, 0010 and 0011 come from uncommitted scans. Mine agrees in substance for 0011 only.

**Bottom line.** The engineering is careful and the numbers are honestly computed. The headline interpretations, however, are stronger than the data:
- "fix works" and "fresh" for 0.8;
- "keeps every answer" for identity dedup.

The evidence supports "works on the development set and near-copies of it". It does not yet support claims about arbitrary natural input or about downstream answer quality. Recommended before any stronger claim:
- run probes v4 and a larger out-of-sample set written by someone other than the author;
- fix the grader (exact-match or a normalised numeric/enum comparison) and re-grade;
- make the frame coverage for permitter-less permissions consistent with the `action` vocabulary, or document the gap;
- commit the fingerprint scan script.

*Self-limitation:* this evaluation was performed by a single AI session. It had no human or native-speaker review, and my probe expectations are my own judgement.
