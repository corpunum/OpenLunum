# False-positive review — mutation corpus vs #253 models

- Commit under test: `f7852a194376affeab02df37a20b793f555f641c`
- Generated: 2026-07-25T10:59:10.855018+00:00 (UTC)
- Corpus: `datasets/adversarial/mutation-false-positive-v1.jsonl` (20 items, SHA-256 `62295f30f64acfebc3f9a4e9dae7be3e8c2526aa48a70be20152d5b6bafecc16`)
- Source: `datasets/dev/multilingual-core-v1.jsonl` (SHA-256 `6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873`)
- Endpoint verified before each run; router restarted between models

Each item is a minimally mutated variant whose meaning genuinely differs from its source. Scoring the
parsed mutation against the **source** item's gold and getting a match is a **false positive**. Every
figure below is recomputed from `raw/items.jsonl`, not copied from a runner summary.

## Headline

| model | items | false positives | rate | outcome: correct | outcome: lost |
|---|---|---|---|---|---|
| qwen36-35b | 20 | 2 | **10.0%** | 7 | 11 |
| qwen3-coder-30b | 20 | 0 | **0.0%** | 4 | 16 |

**The two rates are not comparable as quality scores.** See 'Why 0% is not better than 10%' below.

## By mutation category

| model | mutation | n | false positives | own gold matched |
|---|---|---|---|---|
| qwen36-35b | negation | 4 | 0 | 4/4 |
| qwen36-35b | modality | 4 | 2 | 0/4 |
| qwen36-35b | extra-clause | 4 | 0 | 0/4 |
| qwen36-35b | literal | 4 | 0 | 3/4 |
| qwen36-35b | role | 4 | 0 | 0/4 |
| qwen3-coder-30b | negation | 4 | 0 | 4/4 |
| qwen3-coder-30b | modality | 4 | 0 | 0/4 |
| qwen3-coder-30b | extra-clause | 4 | 0 | 0/4 |
| qwen3-coder-30b | literal | 4 | 0 | 0/4 |
| qwen3-coder-30b | role | 4 | 0 | 0/4 |

## By language

| model | en | el | es | id |
|---|---|---|---|---|
| qwen36-35b | 0/5 | 0/5 | 1/5 | 1/5 |
| qwen3-coder-30b | 0/5 | 0/5 | 0/5 | 0/5 |

## Finding: the near-semantic scorer conflates obligation with permission

Both of `qwen3.6-35b`'s false positives are **modality** mutations, and both cleared the 0.8 near-semantic threshold:

| item | language | near-semantic score | mutation |
|---|---|---|---|
| `modality-battery-es` | es | **0.900** | imperative -> permissive |
| `modality-battery-id` | id | **0.810** | imperative -> permissive |

Spanish *"puedes activar"* (you **may** enable) scored 0.90 against the source imperative *"activa"*
(enable). Indonesian *"kamu boleh mengaktifkan"* scored 0.81. The scorer treated a permission as
semantically equivalent to a command.

This is a safety-relevant conflation. "Enable power saving below 20%" and "you may enable power saving
below 20%" are different instructions. `VISION.md` names *safety-critical information is not lost* as a
success condition; obligation/permission collapse is a direct violation of it.

Negation is handled well by contrast: 0 false positives for both models, and 4/4 own-gold matches for
both, meaning the models parsed the negation correctly *and* the scorer registered the difference.

## Why 0% is not better than 10%

`qwen3-coder-30b` recorded zero false positives, but matched **neither** gold on 16 of 20 items, versus
11 of 20 for the 35b. A scorer cannot produce a false positive on output that resembles nothing. The
coder model's clean sheet is largely earned by parsing too poorly to land on either meaning, which is
consistent with its 25.00% exact parse baseline in the #253 bundle.

Read the two together: the 35b produces usable semantics more often and therefore exposes a real scorer
weakness; the coder-30b mostly fails earlier, before the scorer gets a chance to be wrong.

## Integrity

- 20/20 items processed per model, `attempt: 1` throughout, no exclusions, no silent retries
- Zero infrastructure errors; the run-invalidation rule never triggered
- Both dataset SHA-256s verified by the runner before execution
- Endpoint identity verified before each run; router restarted between models to purge KV state
- **No threshold or gate was changed.** The 0.8 near-semantic threshold is the one already in use;
  #253 blocks calibration until its baselines are reviewed. This report measures, it does not tune.

## Limits

1. **n=4 per mutation category per model.** A 50% rate is 2 of 4 items. Directionally meaningful, not precise.
2. **One item flagged on language grounds**: `negation-preference-id` negates *liking* rather than *preferring* (see #328). It produced no false positive for either model.
3. **The high 'lost' rates dominate both results** and limit what the false-positive rates can be said to measure.
4. Latency is not reported here — it is not the question this run asks, and cross-model latency remains non-comparable per the #253 bundle.
