# Cross-language convergence v1: results

**Run 2026-10-16. Scored offline by [`score.mjs`](score.mjs) against the [pre-registration](PREREGISTRATION.md) and its amendments 1–7. Output: [score.json](score.json). Self-reviewed.**

| | |
|---|---|
| Package | v23, contract `lunum-agent/0.19`, `lfp:2.1` |
| Model and client | `claude-sonnet-5` via Claude Code 2.1.301, one fresh process per sentence |
| Scored runs | `s1e`, `s2e` + `s2e-rest`, `s3e`, `r2e` + `r2e-rest` |
| Raw outputs | [`reports/independent-evaluation/2026-10-16-clc-v1/`](../../reports/independent-evaluation/2026-10-16-clc-v1/) |
| **Cost** | **$36.44** for the scored runs, plus **$4.52** for pilots and stopped attempts, **$40.96 in total** |

## Results against the pre-registered bars

| Measure | Result | Bar | Verdict |
|---|---|---|---|
| **Cross-language convergence**, S1 + S2 pooled | **0 of 5** both-covered pairs had equal identities | ≥ 10 pairs needed to evaluate | **Not evaluable (coverage).** Every observed pair diverged. |
| Greek–Greek paraphrase, S3 | 1 of 1 | ≥ 10 pairs | Not evaluable (coverage) |
| **Run-to-run stability**, S1 against R2 | **4 of 12 (33%)** | < 75% confirms instability | **Confirms the instability** (v17 measured 7 of 12) |
| False merges | 0 | Any merge is a failure | Pass |
| Bilingual identity-deduplication saving, S1 + S2 memory | **0%**: 0 of 160 sentences dropped | (reported) | No saving |

**Coverage:** the share of sentences that received an identity.

| Set | English | Greek | Invalid items, counted as not covered |
|---|---|---|---|
| S1 (owner-supplied sourced pairs) | 11/40 | 3/40 | 11 |
| S2 (Tatoeba pairs) | 11/40 | 3/40 | 9 |
| S3 (Tatoeba Greek paraphrases) | — | 2/30 | 1 |
| R2 (S1 again) | 13/40 | 2/40 | 14 |

Most invalid items are abstentions made **without calling the contract tool** (`CONTRACT_UNBOUND`), usually on very short sentences such as "I know." or «Ξέρω.».

The prediction recorded before the run held: the result is "not evaluable: coverage", and Greek coverage is far lower, 2–3 of 40 against 11–13 of 40 for English.

## Why the pairs diverge

The 5 cross-language pairs that both received an identity used **the same predicate** on both sides, and still diverged:

| Pair | English | Greek | What differs |
|---|---|---|---|
| C30 "I want to talk to a lawyer" | `prefer`, theme `"talk to a lawyer"` | `prefer`, theme `"μιλήσω σε δικηγόρο"` | The open term stays in its source language; `I` vs `speaker` |
| C36 (right of access) | `access` + `update`, kind `simple_fact` | the same predicates, kind `event` | Terms in the source language, `kind`, the term type |
| C37 "I'll call the police" | `notify`, recipient `police` (group) | `notify`, recipient `αστυνομία` (entity), no agent | Term language, term type, a dropped agent |
| T6, T28 | `prefer` / `send` | the same | Term language and labels |

**Cross-language identity for open terms is structurally impossible under `lfp:2.1`:**
- The fingerprint hashes term strings, and a source-retaining extractor writes Greek terms in Greek.
- The two sides can converge only if the model translates. That loses the source literal, which is the failure the [owner-referenced meaning score](../meaning-targets-owner-v1/README.md) penalises.
- The contract has no rule for the language of open terms, and no term-identity layer such as a lexicon, a concept ID or grounding.

## Why the same sentence splits across runs

Of 12 sentences with an identity in both runs, 8 split. The words are the same; the **form** differs:
- a bare string, `"Human dignity"`, in one run, and a typed term, `{"type":"concept","value":"Human dignity"}`, in the other;
- `I` as `{type: text, value}` in one run, and as `{type: actor, id}` in the other;
- `kind` (`simple_fact` / `event`);
- one predicate choice (`describe` / `relate`, `assert` / `describe`).

The identity projection hashes these choices, but the source does not determine them.

## Reading

1. **The vision's central claim fails on this held-out, human-written bilingual set.** Same meaning in English and Greek gives the same identity in **0 of 5** observed pairs, and in no pair where open terms were involved. The bar requires ≥ 10 pairs to declare a kill, so formally this is "not evaluable". The mechanism shown above means more data would not change the direction.
2. **Identity is not stable even for one language and one model.** 33% agreement is worse than v17's 58% (7 of 12). Much of the instability is canonicalisation: bare and wrapped terms, type labels, id and value. That part is fixable deterministically (see the next step).
3. **Coverage of ordinary text is low:** about 30% for English and 5–8% for Greek. The general frames reach English only, by design (ADR 0024).
4. **There is no deduplication saving on bilingual memory**, because nothing converged.
5. **There were no false merges.** The identity is conservative: when it fails, it fails apart, not together.

## Next step this justifies (ADR 0025 path)

The stability bar failed, so a canonicalisation change to the identity projection is now justified. The candidate rules are:
- a bare string filler is the same as `{value: string}`;
- `id` and `value` are folded;
- term types that the source does not determine are dropped;
- `kind` is left out.

It must be **measured offline on these recorded candidates, which is in-sample and labelled so**, and then qualified on a **fresh held-out run** before it becomes a new identity version, with goldens and migration notes.

The cross-language problem cannot be solved by canonicalisation. It needs a term-identity layer, or an explicit decision that open terms are language-bound and that cross-language identity is claimed only for closed vocabularies and grounded IDs. That is the scope question in [ADR 0026](../../decisions/0026-working-scope-checkable-memory.md).

## Limits

- **Small sample:** 5 cross-language pairs and 12 stability pairs.
- **Single test set:** one model and one client.
- **Domain:** the sentences are everyday and legal, not operational traffic.
- **Harness changes:** the runner and gate were changed during the experiment (amendments 2–6). None changed the contract, the sentences or the bars, and every stopped run is kept.

## Post-hoc: meaning, not words (owner feedback, 2026-10-16)

**The owner's point:** a good translation keeps the meaning, not the words. «κάλεσε την αστυνομία», «πήρε την αστυνομία», «τηλεφώνησε στην αστυνομία» and «πήρε το 100» all mean the same. A test should therefore judge meaning, not exact wording.

**What the pre-registered test measured:** it did not demand particular Greek words. It asked whether Lunum gives the same *identity* to the same meaning, which is Lunum's own claim. It fails because `lfp:2.1` hashes the **filler words**: `police` vs `αστυνομία`, and inside Greek alone `κάλεσε` vs `πήρε`. By the owner's standard, the fault is the identity's word-dependence, not the translations.

**What survives when the words are ignored.** [`structure.mjs`](structure.mjs) compares, without the filler words:
- the predicate of each clause;
- the role names;
- negation and modality;
- conditions and consequences;
- the mood (directive or assertive).

This is post-hoc, not pre-registered, and offline.

| | Exact identity | Structure only |
|---|---|---|
| English ↔ Greek (S1 + S2) | 0 of 5 | **3 of 5** |
| Greek ↔ Greek paraphrase (S3) | 1 of 1 | 1 of 1 |
| Same sentence, two runs (S1 vs R2) | 4 of 12 | **9 of 12** |

**Both structural cross-language misses are a Greek pro-drop effect.** «Θα καλέσω την αστυνομία» has no written subject because the verb ending carries it, so the extractor drops the agent on the Greek side and keeps "I" in English (C37). In C36 an implied agent is filled on one side only. A meaning-based identity needs a rule that a subject recoverable from verb morphology is still the agent.

## What this implies for testing and design

1. **Evaluation in three levels**, from this point on:
   - **(a) structure agreement:** mechanical and free;
   - **(b) meaning equivalence:** a bilingual judge (the owner, plus a cross-vendor model with its agreement reported) decides whether the two records mean the same, whatever words they use;
   - **(c) exact identity:** needed only where deduplication or exact comparison is claimed.

   A result must say which level it reports.
2. **For identity to follow meaning rather than words**, filler terms need a language-neutral concept layer. «αστυνομία», «police», «το 100» and «πήρε»/«κάλεσε» (in the "phone" sense) would map to shared concept IDs, either through an existing multilingual concept inventory (WordNet/BabelNet-style synsets or Wikidata) or through owner-reviewed mappings, and identity would hash the concept rather than the word. This is design work, not a canonicalisation tweak, and it would need its own pre-registered test.
