# Project status

**As of 2026-10-17.** This is an experimental research and reference implementation, not a qualified production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track open questions.

## Since 2026-10-17

- **Rust parity crate:** `crates/lunum-sem` reproduces `lfp:2.1` exactly (#722). It is tested against the golden file `eval-results/golden-vectors/lfp21-golden.json`, which grew from 7,070 to 7,089 entries.
- **Forbidden keys:** `__proto__`, `constructor` and `prototype` keys are now rejected at every depth (#723), in `packages/core` and the Rust crate. Replay of the old and new builds showed 0 identity movement for inputs without those keys (a bug fix allowed by ADR 0025). The frozen instruction package is now **v24**; contract text is unchanged and v23 stays frozen and is tested as historical.
- **Unicode pin:** `lfp:2.1` is pinned to Unicode 17.0 with a canary test, and CI pins Node 22.22.2 via `.nvmrc` (#724), so a Unicode change is a deliberate PR.
- **ADR 0027 (identity projection) is parked.** Two held-out gates failed bar 1 with Sonnet: v1 candidate 23/26 (88.5%), revised v2 candidate 18/22 (81.8%; v1 16/22, `lfp:2.1` 9/22). Bars 2 and 3 passed. The remaining splits are mostly frame choice, a contract question that a projection cannot fold. Not implemented; `lfp:2.1` unchanged.
- **ADR 0029 (Greek source-bound frames and pro-drop deixis) is proposed**, design only. A held-out pre-registration ([greek-frames-heldout-v1](experiments/greek-frames-heldout-v1/PREREGISTRATION.md)) comes before any code. The ADR is renumbered to package v25; the Greek baseline uses v24, which has the same contract as v23.

## Earlier, 2026-10-16

- **Frozen:** protocol 0.6, frames 0.8, contract 0.19, package v24 and identity `lfp:2.1`, until held-out evidence exists ([ADR 0025](decisions/0025-contract-freeze-pending-held-out-evidence.md)).
- **Proposed working scope:** a checkable memory layer, with semantic identity claimed only where convergence is measured ([ADR 0026](decisions/0026-working-scope-checkable-memory.md)). It awaits the owner's decision.
- **The v17 re-run is now scored** ([report](reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md)). Compared with the original run:
  - outcome 21/30 against 27/30;
  - reviewed meaning 9/16 against 13/16.

  **The same sentence extracted twice gets the same identity 7 times in 12**, because the identity hashes labels the source does not determine.
- **Reviews:**
  - a same-family review ([Fable](reports/independent-evaluation/2026-10-16-fable-review/REPORT.md));
  - a [core module audit](reports/diagnostic/2026-10-16/core-module-audit/README.md): 38 of 85 modules (49% of lines) are reached only by tests, and none is used by OpenUnum alone;
  - a [cross-vendor review packet](experiments/cross-vendor-review-v1/README.md);
  - the [owner's review worksheet](experiments/owner-greek-review-v1/README.md): native Greek, the 14 unresolved meanings, and 40 authored EN/EL pairs.

- **Owner review returned (2026-10-16)** ([intake](experiments/owner-greek-review-v1/INTAKE.md)). It is AI-assisted drafting, checked by the native-speaker owner.
  - 18 of the 19 AI-written Greek sentences are natural.
  - V8 merges «στο κοινό» (made available to) with «για το κοινό» (intended for) under one role.
  - Greek imperative/aorist homography is confirmed by a native speaker.
  - Modal "can / μπορεί" has two or three readings that a parse silently collapses.
- **Data:** the Tatoeba EN–EL export (17,599 human pairs, CC BY 2.0 FR) is [added](datasets/third-party/tatoeba-eng-ell-2026-10/README.md).
- **[Cross-language convergence v1](experiments/cross-language-convergence-v1/PREREGISTRATION.md) is pre-registered** (S1, S2 and S3 plus a repeat run).
  - Preflight passed with 0 provider calls.
  - **It waits for the owner's budget approval** (about $38 estimated).

- **Live results, 2026-10-16:**
  - **The cross-language convergence test ran:** [results](experiments/cross-language-convergence-v1/RESULTS.md), $41.
    - English sentences and their human Greek translations got the same identity in **0 of 5** pairs where both sides got one.
    - Coverage: English about 30%, Greek 5–8%.
    - Run-to-run stability: **4 of 12**.
  - **Delivery fix:** contract 0.19 had never reached a Claude Code extractor. The client cut the 60 KB result to a 2 KB preview; v23 delivers it compactly.
  - **Meaning against the owner's readings:** 16/30 for both earlier runs ([targets](experiments/meaning-targets-owner-v1/README.md)).
  - **Real work log:** discourse compaction gives −35% characters with 96% of literals kept, and uses 0 semantic identities ([report](experiments/session-transcript-compaction-v1/README.md)).
  - **Proposed that day:** ADR 0027, a canonical identity projection (in-sample 4→8 and 7→11 of 12). Its held-out gates then failed; see above.

## What exists

**Versions:**

| Artifact | Version |
|---|---|
| Candidate schema | `lunum-sem/0.1-draft` |
| Strict identity | `lfp:2.1` (Unicode 17.0 pinned; Rust reproduction in `crates/lunum-sem`) |
| Protocol | `lunum-protocol/0.6`: 55 predicates (0.5 added inclusive `at_most`/`at_least`, ADR 0022; 0.6 added seven general predicates, ADR 0024), with verb aliases |
| Frames | `lunum-frame/0.8`: 46 framed predicates (seven general source-bound frames for ordinary statements, ADR 0024; imperative `deploy`/`rotate` need no agent, `deploy` theme, `restart` count, ADR 0023) |
| Agent contract | `lunum-agent/0.19` |
| Frozen instruction package | v24 (served runtime after the forbidden-key change; contract text as v23; v22 was general source-bound frames, protocol 0.6, frames 0.8; v20's imperative-agent rule and frames 0.7; v19's inclusive bounds as `at_most`/`at_least` conditions; v18's number-word, relative-time and threshold rules; served discourse-record module and MCP tools; complete repository-owned served-JS inventory) |
| Discourse records | `lunum-discourse/0.1` surface records over source-span units (ADR 0021); no identity |

Other schema and fingerprint contracts, and migration fixtures, coexist. A file named `1.0`, or an internally frozen contract, is not external ratification.

**Core refuses identity to a candidate that:**
- violates the actual transport schema, is malformed or non-canonical;
- violates its frame, including required, dependent and distinct roles;
- fills a role with a placeholder (decisions/0007);
- uses the ambiguous `permission` + `negated` prohibition (decisions/0015);
- drops a number, identifier or recognized unambiguous full date in its source, or puts it only in identity-excluded evidence (decisions/0016, [0018](decisions/0018-date-and-evidence-retention-boundary.md) and [0019](decisions/0019-month-name-date-retention.md)). This is a presence floor, not role/meaning verification.

The rejected source text is still kept.

**Surfaces:**
- MCP server; default context mode `natural`, with `identity_dedup` opt-in;
- CLI;
- HTTP scaffold, with placeholder routes;
- in-tree OpenUnum adapter.

## What the evidence says

Historical scored MCP runs used Claude Code (`claude-sonnet-5`), one fresh process per sentence, with Lunum MCP tools only. See the [summary](reports/diagnostic/2026-09-26/EVALUATION.md). A separate [three-call Luna development pilot](experiments/luna-source-only-pilot-v1/README.md) uses the current public contract and actual builder/submission API, not MCP-only parsing. It is not protected accuracy or readiness evidence.

- **On the author's material, extraction behaves as specified:**
  - missing-argument probes 20/20, 18/18 and 16/16 in each of 3 repetitions;
  - V8 development set: 19–20 of 21 source-relative and 3/3 abstentions.
  - This is in-sample or author-written.
- **On fresh sentences from an independent session, meaning fidelity is the weak point.** [Round 2](reports/independent-evaluation/2026-09-26-round2/REPORT.md) scored **27/30 on outcome and reported 20/30 on meaning**. The manual meaning score is not settled: e02's threshold is present in the ledger, while other omissions and ambiguities were unflagged. The [offline diagnostic](reports/diagnostic/2026-10-02/meaning-scoring-v1/README.md) preserves the original evidence and expectations, with 12 valid self-reviewed parse targets, 4 abstention targets, and 14 unresolved cases. It is not a replacement overall accuracy score or a new live run.
  - The prohibition split and the dropped digit literals (2 of those 7 losses) are now mechanically blocked.
  - Dropped words, recurrences and wrong predicates are not blocked.
  - The offline scorer reproduced a core/transport discrepancy: e05 fails the actual wire schema but contract 0.12 reported transport-valid and issued identity (unpromoted). [Contract 0.13](decisions/0017-authoritative-transport-validation.md) now rejects it before normalization. Its corrected builder uses wire-shaped nested clauses. The deterministic audit withholds 48 historical identities and retains 496 unchanged; 38 of 176 frozen source-relative matches were wire-invalid. Historical outcome/match labels are not proof of full transport conformance. Contract 0.13 has only the small development pilot above, not a fresh protected qualification run.
- **Memory QA:** natural text deduplicated by identity used about 60% fewer input tokens. Sonnet kept 20/20 answers; **Haiku answered 1 question wrong in 5 of 9 runs**. The Lunum-Code renderer 0.1 loses answers. The corpus is 24 self-built sentences with paraphrase-heavy duplication, so this is not a savings estimate for real memory.
- **Identity stability:** a committed scan found no identity change from any vocabulary or frame change after it was introduced. Every loss of identity is listed in the ADRs.

Evaluation has been done by the author and by two other sessions of the same vendor and model family. There has been **no human, native-speaker or cross-vendor review**.

**Current contract 0.19 is not live-qualified.** Since 0.19 ordinary statements can be framed as `define`, `describe`, `assert`, `relate`, `enumerate`, `quantify` or `topic`, with a deterministic source-bound check ([ADR 0024](decisions/0024-general-source-bound-frames.md)); a replay of 391 recorded candidates changes no identity, and yield on real text is not claimed in this repository. Since 0.18 imperative `deploy`/`rotate` need no agent and `restart` keeps a count ([ADR 0023](decisions/0023-imperative-frames.md)); a replay of 229 recorded candidates changes no identity. Since 0.17 an inclusive bound (`up to`, `έως`, `at least`) is an `at_most`/`at_least` condition instead of an abstention ([ADR 0022](decisions/0022-inclusive-bound-predicates.md)); a replay of 227 recorded candidates changes no identity. A ten-sentence 0.16 smoke check ([contract-0.16-live-check-v1](experiments/contract-0.16-live-check-v1/RESULTS.md), `claude-sonnet-5`, $1.48) passed e02 and carried every relative time and number word that reached a candidate, but issued 5 of 8 probe identities against a bar of 6: the misses were frame gaps (`deploy`/`rotate` require an agent, `restart` has no count). Since 0.16, English and Greek
cardinal number words are numbers and relative times (`by Friday`, `αύριο`,
`next week`) are literals a candidate must carry; a strict threshold on a role
is a `below`/`above` condition
([ADR 0020](decisions/0020-number-words-and-relative-times.md)). A replay of the
221 recorded candidates in the repository changes no identity. Deterministic checks correct a
false rejection of a dotted German date and block date swaps, quantity/date
confusion and evidence-only literal laundering. Since 0.15, full English and
Greek month-name dates (`14 January 2027`, `14 Ιανουαρίου 2027`) are also
retained as exact dates; year-less dates are not. Sem date values and the
`lfp:2.1` projection are unchanged. See [ADR 0018](decisions/0018-date-and-evidence-retention-boundary.md)
and [ADR 0019](decisions/0019-month-name-date-retention.md).
These checks do not turn source retention or candidate identity into semantic
accuracy or trust. Historical 0.13 pilot/reviews remain historical.

## What is not established

- Reliable general raw-text-to-Sem conversion across languages and domains.
- Token savings with preserved answers on real memory data.
- A validated near-semantic threshold under extraction errors.
- Production security, operations, deletion integration, or adoption by an unrelated product.
- A trained semantic compiler.

## Next, in order

**The proposed plan is [docs/PLAN-rust-engine-language-pairs.md](docs/PLAN-rust-engine-language-pairs.md) (2026-10-22, awaiting the owner's review):** English → Lunum → English, then Greek → Lunum → Greek, then English ↔ Greek, on the Rust engine. The 2026-10-16 handoff it builds on is [archived](research/archive/handoffs/HANDOFF-2026-10-16.md). The list below is older.

1. **Owner review (in progress).** [Worksheet](experiments/owner-greek-review-v1/README.md):
   - Part A resolves the 14 unscorable targets;
   - Part B reviews the AI-written Greek;
   - Part C supplies the 40 held-out EN/EL pairs.
2. **A cross-vendor review** of the repository ([packet](experiments/cross-vendor-review-v1/README.md)), for example Sol 6.1 or Qwen Flash.
3. **Pre-register and run the first held-out tests under the freeze** (ADR 0025):
   - (a) EN/EL convergence on the owner's pairs, run twice, which also measures run-to-run identity stability;
   - (b) general-frame yield and faithfulness on fresh real OpenUnum text.
4. **Identity stability.** If 3(a) confirms the 7/12 split, propose an identity projection without source-undetermined labels, as a versioned fingerprint change with goldens and migration.
5. **Core cleanup.** If the owner agrees, move the 15 "later" modules to a private experimental package and archive the 6 out-of-scope ones ([audit](reports/diagnostic/2026-10-16/core-module-audit/README.md)).
6. **Real memory data** before any token-saving claim. The recall and discourse work on OpenUnum stays the main product path.

## Process

- Trunk-based on `main` ([operating model](docs/REPOSITORY_OPERATING_MODEL.md)). The earlier multi-agent process is [archived](research/archive/operating-model-multi-agent-2026-09/).
- Original code is Apache-2.0 since 2026-09-14 ([LICENSE](LICENSE), [scope](LICENSE.md)).
- No readiness percentages are maintained. The historical scorecards are [archived](research/archive/readiness-before-public-review-20260914.md) as superseded.
- OpenUnum is a separate product; the in-tree adapter is not adoption evidence.
