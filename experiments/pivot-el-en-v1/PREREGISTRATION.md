# English pivot, Greek → English (plan stage P, P1 / P2 / P4): pre-registration

**Committed 2026-10-22, before any model call on the held-out pairs. Self-reviewed.** The owner approved the English-pivot strategy on 2026-10-22 ([ADR 0030](../../decisions/0030-english-pivot-translation-adapters.md)); this tests its inbound half. The adapter's prompt (`pivot-translate/0.1`), schema, guards and agreement rule are in [`packages/eval/src/pivot-adapter.ts`](../../packages/eval/src/pivot-adapter.ts) at this commit and do not change before the run. Only the 20 dev pairs were used while writing them; the author did not read the held-out pairs.

**Question.** When a Greek sentence reaches Lunum through two independent model translations into English and the deterministic guards, (P1) does it get a record about as often as the human English translation of the same sentence, (P2) is that record the same identity as the human English one, and (P4) does every literal survive?

## Data ([`select.mjs`](select.mjs) → [`pairs.json`](pairs.json), deterministic)

- Tatoeba EN–EL pairs (CC-BY 2.0 FR, already in the repository), English 4 to 20 words, one pair per English and per Greek sentence, **neither side found anywhere else in the tracked repository** (so no overlap with R4, the Greek-frames pairs, the ADR 0027 gates or any probe).
- **Held-out: 160 pairs** `P1`–`P160`, seed `pivot-el-en-v1:heldout:2026-10-22`. **Dev: 20 pairs** `D1`–`D20`, seed `pivot-el-en-v1:dev:2026-10-22`, disjoint, for smoke tests only; nothing measured on dev is evidence.
- [`requests-en-human.jsonl`](requests-en-human.jsonl): the 160 human English sentences, runner format, bound to package **v25** (contract `lunum-agent/0.19`, hash `b6fdda4c…`), as R4.
- 160 because R4 covered 24.5% of Tatoeba English: about 39 human-covered items are expected, above the 30 a verdict needs.

## Runs

1. **Translate** every held-out Greek sentence twice, independently ([`translate.mjs`](translate.mjs), one row per pair, prompt hash recorded):
   - **Qwen** (`openai/qwen3.8-flash-next-uncensored-lean` on Halogen, family Alibaba/Qwen), temperature 0, response constrained to `MEANING_FLAGS_JSON_SCHEMA`, rig protocol (one call at a time, not in minutes :00–:10 / :30–:40 UTC, wait while live missions are in flight);
   - **Sonnet** (`claude-sonnet-5-5`, family Anthropic) through `claude -p` on the subscription login, no tools, no MCP, `--json-schema`.
   The guards run on each translation as it is recorded.
2. **Commit** both translation files, then emit [`score.mjs --emit-requests`](score.mjs): one request per **distinct** English string that passed the guards and is not already a human request. Handles are `pv1-en-` + the hash of the English text, so a translation identical to the human English, or to the other translator's, is **one request and one extraction** (memoisation: a production adapter computes the record of an English string once).
3. **Extract** `requests-en-human.jsonl` and the pivot requests with `claude-sonnet-5-5` through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs), package v25, concurrency 1, item ceiling $1.00 (notional, subscription). Invalid evidence (`CONTRACT_UNBOUND`) is re-run once into a `-rerun` directory; still invalid counts as not covered. A run stopped by a usage limit resumes with Sonnet; models are never mixed.
4. **Score** with [`score.mjs`](score.mjs) (committed now).

**Covered** = a valid parse with an `lfp:2.1` identity that is not a sentence copy (`record()` of parallel-document-v1, as R4). **Pivot-covered** = both translations pass the guards, both English strings are covered, and both carry **the same identity** (`agreePivotIdentity`); otherwise the pivot abstains.

## Bars

| # | Measure | Bar | Why this bar |
|---|---|---|---|
| **P1** | Pivot coverage of the 160 Greek sentences against coverage of their 160 human English translations | pivot-covered ≥ **0.8 ×** human-covered; a verdict needs ≥ **30** human-covered | "About as often": the adapter may cost up to a fifth of coverage for its guards and dual agreement, no more. Under the native route Greek coverage was 0 / 50 |
| **P2** | Of pairs covered on both sides, the Greek (pivot) record has the **same identity** as the human English record | ≥ **50%**, over ≥ **20** pairs; and **0** collisions (a pivot identity equal to the human identity of a *different* pair) | Native baseline 0 / 5 ([clc-v1](../cross-language-convergence-v1/RESULTS.md)). The extractor itself returns the same identity for the same English sentence on two runs only 9 / 22 = 41% of the time ([ADR 0027 gate v2](../identity-heldout-v2/RESULTS.md)); 50% asks the pivot to do better than that, which it can only by reproducing the human English wording often enough for memoisation to apply, or by producing wording that extracts to the same fillers. Below 50%, cross-language identity would be limited more by the translation than by the extractor |
| **P4** | Of pivot-covered records, every number, date, relative time and identifier of the Greek source is in the record (`checkLiteralRetention(greek, sem)`), and every name the translators declared is in it in its English form | **100%** | The guard enforces carry-through into the English; this checks it end to end, into the stored record |

P1, P2 and P4 are separate verdicts. A bar with too few items is a **non-verdict**, published as such.

**Reported, not bars:** guard failures per translator and kind; single-translator coverage (Qwen alone, Sonnet alone); how often each translation equals the human English string, and how often the two translators agree on the string; P2 split into pairs where some translation equals the human English and pairs where none does; agreement between the two translators on each meaning flag; `droppedSubject` counts; human sentence copies; notional cost.

**Not measured here:** P3 (Greek round trip; needs the English writer, A2) and level (b) meaning of the pivot records.

## Prediction

- **P1 probably fails**, my estimate 35% to pass. Dual agreement needs both English strings to reach one identity; when the two translators word a sentence differently, the fillers differ and so do the identities. On the dev smoke test (D1–D3, both translators, files in [`dev/`](dev/)), all six translations parsed and passed the guards; the two translators produced the same English string on 2 of 3 pairs (they differed on "toy car" / "little car"), and the human English string was reproduced by Qwen on 2 of 3 and by Sonnet on 1 of 3 (both wrote "I wasn't sure that I would find you here." for "I wasn't sure I'd find you here."). Three pairs are no estimate, only a warning. Single-translator coverage should be close to human coverage.
- **P2:** about 50% likely; it rides on how often a translation reproduces the human English exactly (Tatoeba is probably in both models' training data, which helps here and limits what this says about other text).
- **P4 passes**, but on few items: short Tatoeba sentences rarely carry numbers or dates; names (Tom, Mary) are the main literal.

## Cost

- Translation: 160 Qwen calls (local; minutes of Halogen time, short prompts) and 160 Sonnet calls (about $0.02 each notional on the dev smoke test: about $3).
- Extraction: 160 human + at most 320 pivot requests, minus identical strings; about **$35–45 notional** (R4: $19.79 for 200), Max plan, no API charge.

## Exact commands

```bash
# 1. translations (Qwen under the rig protocol; Sonnet on the subscription)
node experiments/pivot-el-en-v1/translate.mjs --part heldout --translator qwen   --out experiments/pivot-el-en-v1/translations-qwen.jsonl
node experiments/pivot-el-en-v1/translate.mjs --part heldout --translator sonnet --out experiments/pivot-el-en-v1/translations-sonnet.jsonl
node experiments/pivot-el-en-v1/score.mjs --part heldout --qwen experiments/pivot-el-en-v1/translations-qwen.jsonl --sonnet experiments/pivot-el-en-v1/translations-sonnet.jsonl \
  --emit-requests experiments/pivot-el-en-v1/requests-en-pivot.jsonl
git add experiments/pivot-el-en-v1 && git commit -m "pivot-el-en-v1: held-out translations and pivot requests"
# 2. extraction (the runner needs a clean checkout; K = number of lines in requests-en-pivot.jsonl)
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-XX-pv1-human \
  --requests experiments/pivot-el-en-v1/requests-en-human.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v25.json \
  --model claude-sonnet-5-5 --total-budget-usd 160 --item-budget-usd 1.00 --timeout-ms 300000
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-XX-pv1-pivot \
  --requests experiments/pivot-el-en-v1/requests-en-pivot.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v25.json \
  --model claude-sonnet-5-5 --total-budget-usd K --item-budget-usd 1.00 --timeout-ms 300000
# 3. score
node experiments/pivot-el-en-v1/score.mjs --part heldout --qwen experiments/pivot-el-en-v1/translations-qwen.jsonl --sonnet experiments/pivot-el-en-v1/translations-sonnet.jsonl \
  --pivot-requests experiments/pivot-el-en-v1/requests-en-pivot.jsonl \
  --runs reports/independent-evaluation/2026-10-XX-pv1-human,reports/independent-evaluation/2026-10-XX-pv1-pivot --out experiments/pivot-el-en-v1/score.json
```

## Amendment 1 (2026-10-22): Haiku extracts, Luna-low is the second translator

**Committed 2026-10-22, before any model call on the held-out pairs** (no held-out translation or extraction exists at this commit; the only new model calls were on dev pair D1). Reason: **the owner's cost decision of 2026-10-22**, not anything measured. **Bars, data, prompt (`pivot-translate/0.1`), guards, agreement rule, package v25 and the scoring rules are unchanged.**

| | Original | Amended |
|---|---|---|
| Second translator | Sonnet (`claude-sonnet-5-5`, Anthropic) | **Luna** (`gpt-6-luna`, family OpenAI) through `codex exec` on the rig's ChatGPT login, `model_reasoning_effort="low"`, read-only sandbox, empty temp cwd, `--ephemeral --ignore-user-config --ignore-rules`, `--output-schema` = `MEANING_FLAGS_JSON_SCHEMA`; the system line is prepended to the prompt (codex has no system-prompt flag). **No retries**: a failed call is a failed row (not parsed → the pivot abstains on that pair) |
| Extractor (human and pivot requests) | `claude-sonnet-5-5` | **`claude-haiku-5-5`**, same runner, same flags, item ceiling $1.00; still one model for every extraction, never mixed |

Code changes in this commit, all outside the measured path: `translate.mjs` gains the `luna` translator (and records codex's reported token count per row); `score.mjs` takes `--second luna --luna <file>` in place of `--sonnet <file>` (default unchanged). Dev smoke test: D1 through Luna parsed and passed the guards ("I need your car.", 14,470 codex tokens, 6 s; file not committed).

**What this changes in the reading of the results.**
- The family pair is now Alibaba/Qwen + OpenAI; the extractor (Anthropic) is no longer the same vendor as a translator, which removes the overlap the plan flagged.
- **Haiku is not Sonnet.** Coverage moves with the model ([Stage 0](../parallel-document-v1/RESULTS-stage0.md): 1, 4 and 11 of 16 by model), so the "about 39 human-covered" expectation (from Sonnet's 24.5% on R4) may not hold. If Haiku covers fewer than 30 human sentences, P1 is a **non-verdict** as pre-registered, and P2 (≥ 20 both-covered) likely too; that is published as such, not repaired by switching extractor. Results are comparable to each other (same extractor on both sides), **not** to R4 or other Sonnet runs.
- Haiku's same-sentence identity stability is unmeasured (the 9 / 22 figure is Sonnet's).

**Amended prediction.** P1: 30% to pass, and about 35% that it is a non-verdict for lack of human coverage. P2: about 45%. P4: passes on few items.

**Amended cost.** Luna: 160 calls, about 14.5k codex tokens each (mostly the CLI's own instructions), ChatGPT Plus quota, no API charge. Haiku extraction: about 160 + 250 items, estimated **$8–15 notional** (subscription, no API charge).

**Amended commands** (step 1 Qwen and step 4 unchanged except the flags shown):

```bash
node experiments/pivot-el-en-v1/translate.mjs --part heldout --translator luna --out experiments/pivot-el-en-v1/translations-luna.jsonl
node experiments/pivot-el-en-v1/score.mjs --part heldout --qwen experiments/pivot-el-en-v1/translations-qwen.jsonl --second luna --luna experiments/pivot-el-en-v1/translations-luna.jsonl \
  --emit-requests experiments/pivot-el-en-v1/requests-en-pivot.jsonl
# extraction: as step 2, with --model claude-haiku-5-5 and run directories 2026-10-22-pv1-human-haiku / 2026-10-22-pv1-pivot-haiku
node experiments/pivot-el-en-v1/score.mjs --part heldout --qwen experiments/pivot-el-en-v1/translations-qwen.jsonl --second luna --luna experiments/pivot-el-en-v1/translations-luna.jsonl \
  --pivot-requests experiments/pivot-el-en-v1/requests-en-pivot.jsonl \
  --runs reports/independent-evaluation/2026-10-22-pv1-human-haiku,reports/independent-evaluation/2026-10-22-pv1-pivot-haiku --out experiments/pivot-el-en-v1/score.json
```
