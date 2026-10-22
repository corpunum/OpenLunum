# English pivot, Greek → English, relaxed agreement (P1 / P2 / P4, second run): pre-registration

**Committed 2026-10-22, before any model call on these pairs. Self-reviewed.** [pivot-el-en-v1](../pivot-el-en-v1/RESULTS.md) failed P1 (0.61 × human coverage) and passed P2 only through memoised strings. Its results named the honest next step: a pre-registered relaxation measured on fresh pairs. The owner approved it on 2026-10-22 ("yes on all"): (a) the name guard stops flagging nationality and language words, (b) the two translators must agree on the record's **structure**, not its exact identity, with the exact-identity result still reported, (c) single-translator coverage is reported for each translator. The bars stay where they were. One check is added: how many P2 matches come from pairs where neither translation equals the human English.

The author has not read the 200 pairs. [`select.mjs`](select.mjs) printed only counts.

## What changed since v1 (all committed here, nothing else moves)

| | v1 | v2 |
|---|---|---|
| Guards | `pivot-guards/0.1` | **`pivot-guards/0.2`** ([`pivot-adapter.ts`](../../packages/eval/src/pivot-adapter.ts), `PIVOT_GUARDS_VERSION`; tests in [`pivot-adapter.test.ts`](../../packages/eval/test/pivot-adapter.test.ts)). (a) A capitalised Greek word that is a nationality, language or country word («Καναδή», «Καναδέζος», «Γαλλικά», from a closed list of 57 entries, 71 stems) is not an undeclared name **if the English translation contains one of its English forms** (Canadian, French, France, …). A «Γάλλος» translated without French or France still fails, so the guard still checks that meaning. (a′) A declared name inside an English possessive counts as present ("Mary's" carries "Mary"). This possessive fix was not in the owner's list. It is the other name-guard false positive that v1 found (2 pairs), and it is pre-registered here with the rest. Version 0.1 can still be selected (`{ version: 'pivot-guards/0.1' }`), and v1's scripts now pin it |
| Agreement | `agreePivotIdentity`: both pass the guards and land on the **same `lfp:2.1` identity** | **`agreePivotStructure`**: both pass the guards, both English strings are covered, and the two records have the **same structure**: the same predicates, role names, negation, modality and mood after canonicalisation, with fillers left out (`record().structure` of [parallel-document-v1](../parallel-document-v1/score-structure.mjs), the project's level (a)). The **accepted identity is Qwen's**, the primary translator's, so it is fixed before any comparison with the human side. Exact agreement is still computed and reported |
| Pairs | 160 held-out (`P1`–`P160`) | **200 fresh pairs** `Q1`–`Q200` (below) |
| Translators, prompt, extractor, package | Qwen (Halogen) + Luna-low; `pivot-translate/0.1`; Haiku; v25 | **unchanged** |
| No reply | Luna 429s were not translations (v1 amendment 2) | The same rule, written down in advance for both translators: a call with no model text at all (429 or other transport error, network failure, timeout with no output) writes no row. The same pair is re-asked after a wait, at most 6 times, then the run stops and is resumed. Every attempt is logged in `*.no-reply.jsonl`. The rule depends only on whether a reply exists, so it cannot select on content. Any reply from the model is final |

## Data ([`select.mjs`](select.mjs) → [`pairs.json`](pairs.json), deterministic)

- Tatoeba EN–EL pairs (CC-BY 2.0 FR, already in the repository), English 4 to 20 words, one pair per English and per Greek sentence, seed `pivot-el-en-v2:heldout:2026-10-22`, **200 pairs**.
- **Fresh.** Pairs are excluded **by sha256** of either string if they are among v1's 160 held-out and 20 dev pairs or v1's calibration candidates (472 hashes; 11 pairs excluded this way). Pairs are also excluded if either string **occurs anywhere else in the tracked repository**: every file except the Tatoeba dataset and this directory, which covers R4, A0, the A3 coverage set, the Greek-frames pairs, the ADR 0027 gates and probes (19 excluded). 13,016 pairs were eligible.
- [`requests-en-human.jsonl`](requests-en-human.jsonl): the 200 human English sentences, handles `pv2-en-` + hash, bound to package **v25** (contract `lunum-agent/0.19`, the released contract), as v1. This keeps v1 and v2 comparable. A3 (contract 0.21) is a separate measurement.
- Why 200 and not 160: v1 reached 41 human-covered and 24 both-covered pairs, close to the 30 and 20 that a verdict needs.
- Smoke tests use v1's dev pairs `D1`–`D20` (`--part dev`). Nothing measured on dev is evidence. Before this commit, D1 and D2 went through both translators with this code. All four replies parsed and passed the guards. Luna answered in 4–7 s, Qwen in 12–15 s. The files were not committed.

## Runs

1. **Translate** every pair twice with [`translate.mjs`](translate.mjs): **Qwen** (`openai/qwen3.8-flash-next-uncensored-lean` on Halogen, temperature 0, schema-constrained, rig protocol: one call at a time, not in minutes :00–:10 / :30–:40 UTC, waiting while Halogen has more than one request in flight or any queued) and **Luna** (`gpt-6-luna`, effort low, `codex exec` as in v1 amendment 1, calls ≥ 20 s apart). The runs are resumable: a re-run skips the pairs already written.
2. **Commit** both translation files, then emit [`score.mjs --emit-requests`](score.mjs): one request per distinct English string that passes `pivot-guards/0.2` and is not a human request (memoisation as v1).
3. **Extract** the human requests (any time after this commit: they read only the committed human English) and the pivot requests with `claude-haiku-5-5` through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs), package v25, concurrency 1, item ceiling $1.00 (notional, subscription), on a clean checkout. Invalid evidence (`CONTRACT_UNBOUND`) is re-run once into a `-rerun` directory; evidence still invalid after that counts as not covered. A run stopped by a usage limit resumes with Haiku. Models are never mixed.
4. **Score** with [`score.mjs`](score.mjs) (committed now).

**Covered** means a valid parse with an `lfp:2.1` identity that is not a sentence copy (`record()`, as v1). **Pivot-covered** means the pair is accepted under `agreePivotStructure` with `pivot-guards/0.2`.

## Bars (frozen; unchanged from v1)

| # | Measure | Bar |
|---|---|---|
| **P1** | Pivot-covered pairs against human-English-covered pairs, of 200 | pivot-covered ≥ **0.8 ×** human-covered; a verdict needs ≥ **30** human-covered |
| **P2** | Of pairs covered on both sides, the pivot record (Qwen's identity) is the **same identity** as the human English record | ≥ **50 %** over ≥ **20** pairs, and **0** collisions (a pivot identity equal to the human identity of a *different* pair) |
| **P4** | Of pivot-covered records, every number, date, relative time and identifier of the Greek source is in the record (`checkLiteralRetention(greek, sem)`), and every name either translator declared is in it in its English form | **100 %** |

P1, P2 and P4 are separate verdicts. A bar with too few items is a **non-verdict** and is published as one.

**The added check on P2 (reported; it qualifies the verdict).** P2 is split into pairs where at least one translation equals the human English string and pairs where neither does. Where some translation equals the human string, memoisation makes the identity equal by construction. If the split shows **0** matches among pairs where neither translation equals the human English, a P2 pass is reported as **"carried by memoised strings"**, as in v1, and is not read as evidence that different wordings converge. Whatever the counts are, they are stated next to the verdict.

**Reported, not bars:**
- P1 and P2 under **exact-identity** agreement (v1's rule) with guards 0.2.
- P1 under guards **0.1** (structure and exact), which shows what the guard change bought.
- **Single-translator coverage** for Qwen alone and Luna alone (a pair counts if that translation passes the guards and its English is covered), each with its ratio to human coverage.
- How many accepted pairs also had identical identities.
- Agreement outcomes.
- Guard failures per translator and kind (0.2 and 0.1).
- How often each translation equals the human English string, and how often the two translators wrote the same string.
- How often the two translators agree on each meaning flag.
- `droppedSubject` counts, human and pivot sentence copies, and pivot-only coverage.
- No-reply attempts and notional cost.

## What was seen before these bars were written (honesty note)

The scorer was checked on **v1's committed files** (`--pairs`/`--human`/`--handle-prefix pv1-en-`). Under exact agreement and guards 0.1 it reproduces v1's 25 / 41. On those same files, structure agreement with guards 0.2 gives 32 / 41 = 0.78 ×. That figure is an underestimate: strings newly admitted by 0.2 were never extracted in v1. Single-translator coverage there was 34 per translator (0.83 ×). P2 was 19 / 30, with **0 of 9** matches where no translation equalled the human string. These are development numbers on seen data. They are why the prediction below is a coin flip. The bars were set by v1 and the owner, not from these numbers.

## Prediction

- **P1:** about 45 % to pass. Structure agreement and the guard fix recover most of v1's agreement and guard losses. Extractor abstention on the translators' wording stays as it was. v1's development check sat just under the bar.
- **P2:** about 55 % to pass, **carried by memoised strings**. Matches where no translation equals the human English stay near 0, because the extractor still gives paraphrases different fillers.
- **P4:** passes. Structure agreement accepts Qwen's record. A Luna-only name would be missing from it only if the translators disagreed on a name, which the guards make unlikely.

## Cost

- Translation: 200 Qwen calls (local, about 2 hours of wall time under the rig protocol) and 200 Luna calls (ChatGPT quota; v1 used about 0.9 M reported tokens for 160).
- Extraction: 200 human requests plus about 130 distinct pivot strings with Haiku, about **$2–3 notional** (v1: $1.56 for 266), Max plan, no API charge.

## Exact commands

```bash
# 1. translations (clean checkout at this commit; resumable)
node experiments/pivot-el-en-v2/translate.mjs --part heldout --translator qwen --out experiments/pivot-el-en-v2/translations-qwen.jsonl
node experiments/pivot-el-en-v2/translate.mjs --part heldout --translator luna --out experiments/pivot-el-en-v2/translations-luna.jsonl
node experiments/pivot-el-en-v2/score.mjs --qwen experiments/pivot-el-en-v2/translations-qwen.jsonl --luna experiments/pivot-el-en-v2/translations-luna.jsonl \
  --emit-requests experiments/pivot-el-en-v2/requests-en-pivot.jsonl
# 2. extraction (clean checkout after the translations are committed)
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-2X-pv2-human-haiku \
  --requests experiments/pivot-el-en-v2/requests-en-human.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v25.json \
  --model claude-haiku-5-5 --total-budget-usd 200 --item-budget-usd 1.00 --timeout-ms 300000
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-2X-pv2-pivot-haiku \
  --requests experiments/pivot-el-en-v2/requests-en-pivot.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v25.json \
  --model claude-haiku-5-5 --total-budget-usd 200 --item-budget-usd 1.00 --timeout-ms 300000
# 3. score
node experiments/pivot-el-en-v2/score.mjs --qwen experiments/pivot-el-en-v2/translations-qwen.jsonl --luna experiments/pivot-el-en-v2/translations-luna.jsonl \
  --pivot-requests experiments/pivot-el-en-v2/requests-en-pivot.jsonl \
  --runs reports/independent-evaluation/2026-10-2X-pv2-human-haiku,reports/independent-evaluation/2026-10-2X-pv2-pivot-haiku --out experiments/pivot-el-en-v2/score.json
```
