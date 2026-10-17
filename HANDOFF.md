# Handoff: state and next steps, 2026-10-16

This is for the next agent session. It works on the owner's computer, which has normal network access. It was written by the Claude Code cloud session that did the October 16 work (self-reviewed). The detailed evidence is linked from each line.

## Ground rules (read [AGENTS.md](AGENTS.md) first)

- **Trunk-based on `main`.** Run `pnpm verify` and keep a clean tree before every push, then check the post-push CI run.
- **Frozen** ([ADR 0025](decisions/0025-contract-freeze-pending-held-out-evidence.md)): protocol 0.6, frames 0.8, contract `lunum-agent/0.19`, `lfp:2.1`.
  - Instruction package **v24** is the current one (v23 contract text unchanged; v24 added the forbidden-key rejection in the served runtime).
  - No version bump without a pre-registered held-out live result.
- **Evidence rules:**
  - Never edit frozen evidence; supersede it with a new versioned artifact.
  - Commit the pre-registration **before** any model call.
  - Publish failures, stopped runs and costs.
  - Label self-review as self-review.
- **Live runs** use `scripts/research/run-claude-code-source-only.mjs`; see [SOURCE_ONLY_RUNNER.md](scripts/research/SOURCE_ONLY_RUNNER.md). The runner:
  - needs a clean checkout, an exact model ID and an owner-approved budget;
  - runs one item at a time;
  - is checked against the commit it started from, so **never commit while a run is in progress**.

  To run sets in parallel, use one clone per set at the same commit, as clc-v1 did.
- **Copyright:** third-party text that is not openly licensed is never committed. Publish URLs, hashes and aggregates only.

## Where things stand

| Finding | Evidence |
|---|---|
| English and its human Greek translation get the same `lfp:2.1` identity in **0 of 5** pairs where both sides get one. Words are hashed, and open terms stay in their source language. | [clc-v1 results](experiments/cross-language-convergence-v1/RESULTS.md) |
| Ignoring words, the **meaning structure** agrees **3 of 5** across languages and **9 of 12** across runs. Both cross-language misses are Greek pro-drop: the subject is carried by the verb ending, so the agent is dropped. | same, post-hoc section |
| The same sentence, run twice, gets the same identity **4 of 12** times. A canonical projection (in-sample) gives 8 of 12. | [ADR 0027 (proposed)](decisions/0027-identity-projection-candidate.md) |
| Coverage of ordinary text: English about 30%, Greek 5–8%. The general frames are English-only (ADR 0024). | clc-v1 |
| Meaning against the owner's readings: **16 of 30** for both earlier runs, Greek 3–4 of 10. | [meaning-targets-owner-v1](experiments/meaning-targets-owner-v1/README.md) |
| Real agent work log: discourse compaction gives −35% characters, keeps 96% of literals, and uses 0 semantic identities. | [session-transcript-compaction-v1](experiments/session-transcript-compaction-v1/README.md) |
| On the owner's real memory, 0 identities on 21,291 units. Exact recall (prefix plus Greek folding) works. | [STATUS.md](STATUS.md) |
| Owner's native review: 18 of 19 AI-written Greek sentences are natural. Imperative/aorist homography, modal ambiguity of "can"/«μπορεί», and V8 merging «στο»/«για το» κοινό. | [intake](experiments/owner-greek-review-v1/INTAKE.md) |

## The owner's direction (2026-10-16)

**Meaning, not words**, judged at paragraph and page scale, the way professional translators preserve it. Greek can say «κάλεσε / πήρε / τηλεφώνησε στην αστυνομία / πήρε το 100», and all of them are the same meaning. **Use existing bilingual publications as the meaning reference**, instead of per-item human review.

Every result reports which of three levels it measures:
- **(a)** structure agreement;
- **(b)** same meaning, judged by a bilingual judge from another vendor, with owner spot-checks and an agreement rate;
- **(c)** exact identity.

## Next steps, in order

1. **Parallel-document test** ([plan](experiments/parallel-document-v1/PLAN.md)).
   - **Sources:**
     - Europarl EN–EL via OPUS (professional translators, aligned by speech and paragraph);
     - EUR-Lex EN/EL.
     - **Not** en.protothema.gr: it is mostly machine-translated, by the outlet's own account.
     - A model's memory of books is not a reference.
   - **Procedure:**
     - (a) A seeded, deterministic selection script.
     - (b) **Free measure first:** language-neutral anchors (numbers, dates, IDs, from `unitLiterals` in `packages/core/src/discourse.ts`). Compare matched EN/EL documents with mismatched pairs.
     - (c) Pre-register the paid measures: per-document meaning-structure overlap and a cross-vendor same-meaning judgement. About $45 for 20 speeches. Ask the owner to approve the budget.
     - (d) Run, score, publish.
2. **ADR 0027 held-out gate.** A fresh seeded Tatoeba sample run twice; the bars are in the ADR. Implement `lfp:2.2` only if it passes, with goldens and migration.
3. **Concept layer design (ADR draft only).** Fillers map to language-neutral concept IDs (WordNet/BabelNet-style synsets or Wikidata, with owner-reviewed Greek), so identity follows meaning, not words. Add a pro-drop rule: a subject carried by the verb ending is still the agent. Design and pre-register before any code.
4. **Owner decisions still open:**
   - [ADR 0026](decisions/0026-working-scope-checkable-memory.md) (working scope);
   - moving 15 core modules to an experimental package and archiving 6 ([audit](reports/diagnostic/2026-10-16/core-module-audit/README.md));
   - a cross-vendor repository review ([packet](experiments/cross-vendor-review-v1/README.md)).

## Progress since this was written (2026-10-16, later session; self-reviewed)

- **Step 1, free measure: done.** [Results](experiments/parallel-document-v1/RESULTS-anchors.md): Europarl v8 EL-EN, 300 seeded 8-pair passages, 201 informative, matched Jaccard 0.947 against 0.041, top-1 0.817 (0.97+ with two or more anchors). Level below (a); cost $0. The data is in `~/corpora/europarl-opus-v8` (outside the repo; Moses release has no speaker boundaries).
- **Step 1, paid measures: drafted, not run.** [Draft pre-registration](experiments/parallel-document-v1/PREREGISTRATION-paid.md): a 2-passage pilot first with a go/no-go on Greek coverage. Waiting for the owner: Stage 0 budget ($16 reservation), the cross-vendor judge (vendor and access) and spot-check time.
- **Step 2, ADR 0027 gate: prepared, not run.** [Draft pre-registration](experiments/identity-heldout-v1/PREREGISTRATION.md), seeded 160-sentence set, scorer validated against the clc-v1 recordings (4/12 to 8/12). Waiting for budget (two runs, $128 reservation each, about $45 expected).
- **Step 3, concept layer: drafted.** [ADR 0028](decisions/0028-language-neutral-concept-layer.md), design only.
- No model call has been made in this session. Total spend: $0.

## Progress, 2026-10-16/17 (later session, continued; self-reviewed)

- **Owner instruction:** no paid Claude runs and no Qwen/Halogen extraction; use Luna (low), Sol 6.1 (medium) and SuperGemma on the ROG Ally. Runners: [`run-openai-compatible-source-only.mjs`](scripts/research/run-openai-compatible-source-only.mjs), [`run-codex-source-only.mjs`](scripts/research/run-codex-source-only.mjs).
- **Stage 0 of parallel-document-v1:** [results](experiments/parallel-document-v1/RESULTS-stage0.md). SuperGemma 1/16 EN, 0/16 EL; Luna 4/1; **Sol 11/16 EN, 0/16 EL (all Greek "unsupported")**. Stage 1 no-go; the ADR 0027 gate was not run (feasibility rule). The Greek limit is the contract's English-only general frames, not the model.
- **Sentence copies:** 12 of 75 recorded Claude clc-v1 parses are whole-sentence copies ([pilot results](experiments/local-extractor-pilot-v1/RESULTS.md)); scorers now exclude them.
- **Pivot paraphrase (owner's "meaning, not words"):** [design](experiments/pivot-paraphrase-v1/DESIGN.md), [`tools/pivot-miner`](tools/pivot-miner) (Rust), [exploration](experiments/pivot-paraphrase-v1/EXPLORATION.md). On OpenSubtitles the owner's example is attested: «κάλεσε / πήρε / τηλεφώνησε / φώναξε την αστυνομία» all translate "call(ed) the police", and «πάρε το 100» translates "call 911". Model proposals (Qwen, SuperGemma) are attested 49% when both families agree, 28% when one does.
- **10-17, pivot miner:** UniMorph lemma mode added. The pre-registered single-word test against Open Multilingual Wordnet **failed both bars** ([results](experiments/pivot-paraphrase-v1/omw-roundtrip/RESULTS.md)): a defect (transitive class merging built giant English classes) made lemma mode worse; fixed, it ties surface mode on single words (post-hoc). Lemma mode helps phrases (439 vs 9 lines for «καλώ την αστυνομία») but there is no phrase gold yet. Variant lemmas (τηλεφωνώ / τηλεφωνάω) are still split.
- **10-17, pro-drop:** [diagnostic](experiments/prodrop-replay-v1/README.md): 3 of 9 recorded Greek pro-drop records lack an agent, all first person (incl. C37).
- **Owner review waiting:** [WORKSHEET-v2.md](experiments/pivot-paraphrase-v1/WORKSHEET-v2.md) (v1 is superseded). 
- **Next:** a phrase-level gold (from the owner's worksheet answers), variant-lemma merging without chains, a contract decision on Greek frames (needs ADR 0025's held-out path).
- **Rig protocol:** heavy jobs go through the coordinating session (corpunum-6b): ask for a slot; GPU or > 6 GB under `flock ~/.cache/rig-heavy.lock`; never restart Halogen or OpenUnum.

## Known pitfalls hit on 2026-10-16

- **Claude Code persists MCP results above about 50 KB** and shows the model a 2 KB preview. The contract tool returns compact JSON (36 KB), and a test fails at 45 KB. Keep it that way.
- **Session time limits:** background jobs in a cloud session are killed by its time limit. On a local machine, use `nohup`/`setsid` or a terminal multiplexer for long runs.
- **Contract skipped:** short everyday sentences are often refused without the contract call (`CONTRACT_UNBOUND`). The runner records them as invalid and continues; it counts them as not covered.
- **Item ceiling:** use a $0.80 per-item ceiling. Long sentences can exceed $0.35.
