# Review of main @ d79b856: Fable, 2026-10-16

**Provenance.** This review was done by a read-only subagent on the Fable model, launched from a Claude Code session at the owner's request, with no model calls and no edits. **It is the same vendor and model family as every earlier review, so it is not independent in the sense the evaluation protocol needs.** A cross-vendor review is prepared in [`experiments/cross-vendor-review-v1/`](../../../experiments/cross-vendor-review-v1/README.md).

**Checked by the requesting session** (the claims below were verified against the files):
- the frames cover 46 of 55 predicates, under contract 0.19;
- the v17 re-run had no report (one now exists: [REPORT.md](../2026-10-07-round2-v17-live/REPORT.md));
- no artifact exists for the "0.10%" corpunum.com figure in ADR 0024.

**Corrections and additions:**
- The v17 scoring (section 3d) found **lower** reviewed-target scores than the original run, 9/16 against 13/16.
- It also found that **one sentence extracted twice gets the same identity in only 7 of 12 cases**. This is a stronger finding than the review's.
- "recall@5 0.405→0.80→0.99" (section 1) mixes two measures. 0.405→0.80 is overall recall in source-locator-v1. 0.99 is recall on unaccented Greek queries only in greek-fold-recall-v1, where the composite is 0.88.
- The claim that 57% of core is "scaffold" (section 3g) is re-examined in the [core module audit](../../diagnostic/2026-10-16/core-module-audit/README.md). "Unused by any product surface" is not the same as "dead".

The text below is the subagent's report, unedited.

---

# OpenLunum independent review — main @ d79b856 (2026-10-16)

Read-only. No model calls. Sources are cited by path; numbers were re-checked against the files, not taken from the summaries.

## 1. Verdict

OpenLunum is a well-engineered, scrupulously documented research scaffold whose central thesis — paraphrase- and language-invariant semantic identities that cut agent context cost — has, after ~4 months and ~$60 of live runs, no supporting evidence on real data and substantial evidence against it. The only things that produced measurable value on the owner's real memory are *not* Lunum-Sem at all: an FTS5 prefix fallback plus Greek diacritic folding (recall@5 0.405→0.80→0.99) and a surface-level discourse compactor. The core identity path issued 0 identities on 21,291 real units; ADR 0024's answer (general frames) explicitly abandons paraphrase invariance and multilinguality. The project is honest about each individual limitation, but the aggregate framing (VISION.md, README's pipeline diagram) still sells the thesis the data contradicts. The vision should be narrowed now, not after another dozen contract bumps.

## 2. What is genuinely solid

- **Evidence hygiene.** Pre-registered bars committed before measurement (`experiments/*/PREREGISTRATION.md`), failures published as failures (`experiments/ambient-discourse-v1/RESULTS.md`, `-v2`), frozen packages with hash bindings, a runner that refuses mismatched builds (`run-summary.json` in `reports/independent-evaluation/2026-10-07-round2-v17-live/`). The ADR 0013 amendment reversing a default after a grader bug is the right instinct. Few solo research repos do this.
- **The refusal machinery.** `packages/core/src/literal-retention.ts` (digit/number-word/relative-time floor), `source-bound.ts` (every filler must be contiguous source words, no content word dropped), placeholder and prohibition-encoding gates in `agent-native.ts`. Deterministic, tested, replayed against 391 recorded candidates with 0 identity movement (`experiments/general-frames-v1/RESULTS.md`). Unit tests: core 1,929, api 202, cli 189, mcp 67, adapter 45 — all pass locally.
- **Identity projection discipline.** `fingerprint.ts` pins the projection tag to `lunum-protocol/0.1` so additive registry changes cannot move `lfp:2.1`; evidence fields are explicitly excluded.
- **The L1 recall work** (`experiments/source-locator-v1`, `greek-fold-recall-v1`): held-out, bar-driven, shipped to OpenUnum, cheap (no index), honest about what it didn't measure.
- **Discourse records** (ADR 0021, `discourse.ts`): the one piece that touched real traffic and passed its QA bar (`compacted-context-graded-qa-v1`: 18.0% vs 18.0%, non-inferior).

## 3. What is not working or is self-deceiving

**a. The identity thesis has zero yield on the target data.** `experiments/discourse-unit-identity-v1/RESULTS.md`: 0 of 21,291 units identified; only 71 distinct units (0.8%) even start with a lexicon verb; ceiling for identity-based dedup gain estimated at 3.2% of unit tokens *at best*. This is the owner's actual memory. Everything favourable (V8 19–20/21, probes 20/20, −60% tokens) is on 24–30 author-written policy sentences; the independent evaluator's fresh ordinary sentences scored 13/24 and 20/30 on meaning (`reports/independent-evaluation/2026-09-26/REPORT.md`, `-round2/REPORT.md`).

**b. ADR 0024 quietly replaces the thesis with its opposite.** `decisions/0024-general-source-bound-frames.md` §"What an identity on a general frame means": "It does not mean paraphrase-invariant meaning… 'X is fast' and 'X is quick' get different identities… English only." A source-bound identity over verbatim word spans is a normalised text hash with a frame label — functionally close to `surfaceFingerprint` (`lsf`). The repository's own binding principle "Lunum-Sem is language-neutral structured meaning" (AGENTS.md, operating model) is contradicted by the latest protocol version. Nothing in VISION.md or README's diagram ("same meaning in EN / EL → same identity") was updated.

**c. Cross-language convergence was never real for open terms.** `fingerprint.ts` hashes raw `value` strings; the first evaluator noted p21 translated a Greek literal while p23 did not, so EN/EL identity depends on whether the model happens to translate. `inclusive-bound-v1/RESULTS.md` concedes g02/e02u differ "as they should" because ids are surface strings. Convergence was demonstrated only for ID-coded entities (Q-81, R-7).

**d. Contract churn without qualification.** `lunum-agent` went 0.4→0.10 on 2026-09-26 alone and 0.12→0.19 between 09-27 and 10-10 (git log). 0.19 has no live run; the only live checks since 0.12 are 8–10 author-written probes that "exposed the gaps" (`frame-gaps-v1/RESULTS.md`: "Not held out"). The v17 re-run of the round-2 sentences (`reports/independent-evaluation/2026-10-07-round2-v17-live/`, $4.08, 18 parse / 12 abstain vs 23/7 originally) has ledgers but **no REPORT.md and no scoring anywhere in the repo** — money spent, no conclusion published.

**e. Both compaction candidates failed their bars**, and the passing graded-QA result is 11/61 vs 11/61 (18%), i.e. the model can't answer these questions in either condition; non-inferiority at 18% says little. Ambient v1: −36.6% tokens but 33% prefix reuse (cache churn eats the saving); v2 fixed reuse and lost the saving (−13.1%).

**f. Docs overstate or are stale.**
- README still says "37 predicate frames (of 46 registered)" and "4,315 tests"; actual: 46 framed of 55 (`SEMANTIC_PROTOCOL_REGISTRY`), protocol 0.6. STATUS's version table says protocol 0.5/48 predicates while its prose says 0.6.
- ADR 0024 cites "the downstream corpunum.com integration measured 0.10%" — no artifact for this exists in the repo.
- AGENTS.md/operating model say "no task branches or PRs"; PRs #715–#721 were merged 10-08→10-10. Either the rule or the practice is wrong.
- ADR 0021 reports −70% prompt tokens; `discourse-unit-identity-v1` notes the current figure is −52% after a later fix; ADR 0021 was not amended.
- ADR 0013 still carries the title "identity_dedup is the recommended mode" above an amendment that reverses it.

**g. Core is 57% scaffold.** 46 of 85 modules (15,261 of 26,629 lines: `tenant-isolation`, `prohibited-domains`, `token-atlas`, `human-review-policy`, `agent-state-tamper-evidence`, `supply-chain`, `release-governance`, …) are imported by no product surface (MCP/CLI/API/eval/scripts); their exported symbols are referenced only by their own tests. This is aspirational API surface that inflates the apparent maturity and the maintenance cost.

**h. Review independence is nil.** Every evaluation, label, Greek sentence and ADR is Claude-authored. The "independent" evaluations are other Claude sessions. `experiments/meaning-human-review-packet-v1` has "all reviews pending" since 10-02.

## 4. Is the vision still right?

Supported by evidence: (i) mechanical refusal of malformed/lossy candidates is cheap and valuable; (ii) exact-literal retention and recall (IDs, hashes, paths, Greek accents) are where real agent memory loses value; (iii) surface-structured compaction of tool logs can cut prompt tokens without losing literals.

Contradicted: (i) "equivalent meanings converge to stable identities across languages" — unmeasured for open terms, abandoned in 0.19; (ii) "model-facing context measurably cheaper" via Lunum — all savings came from dedup of a paraphrase-built corpus, 3.2% ceiling on real data; (iii) "universal semantic layer… preferences, beliefs, fiction, modality…" — 46 frames of policy verbs, English-only general frames.

Proposed reframe:
> **Lunum is a checkable memory layer for agent systems: deterministic structure over source text, with exact literal retention, verified recall, and refusal when a representation would lose meaning. Semantic identity is issued only for a small closed vocabulary where paraphrase convergence has been measured, and is otherwise a non-goal.**

Keep Lunum-Sem as the closed-vocabulary subset; drop "language-neutral universal meaning" from the binding principles until a held-out cross-language experiment passes.

## 5. Path forward (4–6 weeks)

1. **Publish the v17 round-2 re-run.** Score the 30 ledgers with the frozen scorer; REPORT.md within the week. Kill criterion: none — it's owed.
2. **Freeze the contract at 0.19 for the whole period.** No protocol/frame/contract bump without a held-out live result. Success: zero version bumps in 4 weeks. Kill: if a bump is "needed", it needs a pre-registered held-out set first.
3. **Run the human review packet** (`meaning-human-review-packet-v1`) with a native Greek speaker and one non-Claude model (GPT/Gemini) as adjudicators. Success: ≥20 of 30 sources adjudicated by a human; agreement rate published. Kill: if no human can be obtained in 3 weeks, mark Greek "unreviewed, do not claim" in README and remove EL from the language list.
4. **Measure general-frame yield and precision on real text, held out.** 200 random units from a fresh OpenUnum export (not the 15 dev sessions), one model, contract 0.19; label 50 issued identities for faithfulness. Success: ≥30% yield and ≥90% faithful. Kill: <10% yield or <80% faithful → general frames stay but are removed from the identity path (surface records only).
5. **Cross-language convergence test, or drop the claim.** 40 EN/EL pairs with no ID codes, authored by someone other than the extracting model, both languages run live. Success: ≥70% shared identity. Kill: <40% → delete the EN/EL convergence claim from README/VISION and the operating-model principle.
6. **Ship what works to OpenUnum and measure one real-usage week:** prefix+greekFold recall (done), discourse view under pressure (done), and the "first-shown wins" ambient variant proposed in `ambient-discourse-v2/RESULTS.md`, pre-registered with the same 4 bars plus ≥90% prefix reuse. Kill: fails any bar → stop ambient work.
7. **Cut core scaffold.** Move the 46 unreferenced modules to `research/archive/` or a `packages/core-experimental` package; keep tests with them. Success: core ≤ ~12k lines, `pnpm verify` green, no public API claims for archived modules.
8. **Reconcile docs in one pass**: README counts, STATUS table, ADR 0013 title, ADR 0021 numbers, AGENTS.md PR rule, VISION reframe. Success: a second session can find no stale number.

**Stop doing:** adding frames/predicates for author-written probes; new contract versions without held-out data; benchmarks on the 24-sentence V8 corpus; same-model "independent" evaluations labelled as independent; rebinding scoring manifests (v5…v8) that add no review; writing core modules for capabilities (tenancy, supply chain, token atlas) nobody calls.

## 6. Decisions only the owner can make

1. Accept the narrowed vision (checkable memory layer) or keep the universal-semantics goal and fund the human/cross-vendor evaluation it requires.
2. Whether general-frame identities (0.19) count as "semantic" at all, given they are English-only and non-paraphrase-invariant; if not, they violate the binding principle and must be reclassified as surface records.
3. Budget and source for human review: a native Greek reviewer and a non-Anthropic model; without them, Greek and "independent" claims should be withdrawn.
4. Governance: PRs or direct-to-main — pick one and fix AGENTS.md.
5. Whether OpenUnum's real traffic (private) can be sampled into a frozen, shareable held-out set; without it every "real data" result stays unreproducible aggregates.
6. Whether to archive 57% of core now, accepting that the API surface shrinks publicly.
7. The alias-table and `use/open/enter→access` semantic merges (ADR 0011) remain unreviewed human judgements; decide them or revert them.
