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

## The obligation/permission blindness is present in BOTH models

Independent review established this more sharply than the original framing. `qwen3-coder-30b` records
zero false positives on modality, but that is a threshold artifact, not sensitivity. Its four modality
items score against source gold at:

| item | source near-semantic score | own gold matched | own-gold missing feature |
|---|---|---|---|
| `modality-battery-en` | 0.727 | no | `modality:0:permission` |
| `modality-battery-el` | 0.652 | no | `modality:0:permission` |
| `modality-battery-es` | 0.727 | no | `modality:0:permission` |
| `modality-battery-id` | 0.727 | no | `modality:0:permission` |

All four sit just **under** the 0.8 threshold, and all four **also fail to register the obligation ->
permission shift** — the identical blindness seen in the 35b. The difference is that coder-30b's
unrelated vocabulary mismatches (it emits `is_below`, and `agent:system` differently from the schema's
expected wording) depress its source-comparison score by roughly 0.05-0.15, landing it below the
threshold for reasons that have nothing to do with modality.

So the correct reading is not "one model is modality-blind." **Both models fail to emit the expected
`permission` value; only one of them scores highly enough for that failure to surface as a false
positive.** `qwen3-coder-30b` omits modality on all four items — the same omission that produced the
35b's two false positives — yet stays under threshold because unrelated vocabulary mismatches depress
its score. A threshold change alone would convert those zeros into false positives without any change
in model behaviour.

### CORRECTION (supersedes the mechanism previously stated here)

An earlier version of this section claimed that in both surfaced false positives the parsed output
"genuinely contains `modality: permissive`" and concluded that "the failure is in the comparison, not
the parse." **Both halves of that claim are false.** It was written from a reviewer's assertion without
checking `parsedSem`, and is corrected here. No measured value changes; only the explanation does.

What the raw records actually show, for all eight modality items:

| model | lang | modality emitted | source score | false positive |
|---|---|---|---|---|
| qwen36-35b | en | `permissive` | **0.000** | no |
| qwen36-35b | el | `possible` | **0.000** | no |
| qwen36-35b | es | *(none)* | **0.900** | **yes** |
| qwen36-35b | id | *(none)* | **0.810** | **yes** |
| qwen3-coder-30b | en | *(none)* | 0.727 | no |
| qwen3-coder-30b | el | *(none)* | 0.652 | no |
| qwen3-coder-30b | es | *(none)* | 0.727 | no |
| qwen3-coder-30b | id | *(none)* | 0.727 | no |

The relationship is exact and runs the opposite way to the earlier claim:

- **When a modality field is emitted at all, the score against the bare-imperative source drops to
  0.000.** The scorer does *not* ignore an unexpected extra field — it penalises it decisively. The
  scorer behaved correctly in every one of these eight cases.
- **False positives occur precisely where the model omitted modality entirely**, so the parse collapsed
  into the source meaning and scored 0.90 / 0.81.

**The failure is in the parse, not the comparison.** The corrective work is on the model/prompt side —
getting models to emit the controlled-vocabulary value — not on the scorer.

### What both models actually get wrong

No item in either model produced the expected controlled-vocabulary value `permission`:

- `qwen3.6-35b` emitted **non-canonical vocabulary** on 2 of 4 (`permissive`, `possible`) and **dropped
  modality entirely** on the other 2.
- `qwen3-coder-30b` **dropped modality on all 4**.

So the obligation/permission distinction is unreliably encoded by both models — but via two distinct
failures (wrong vocabulary vs omission) that the earlier text conflated into a single scorer defect.

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

1. **n=4 per mutation category per model.** A 50% rate is 2 of 4 items. The modality finding is presented as two individually inspected instances of a specific scoring gap, corroborated by all four of the other model's modality items showing the same missing feature — not as a population rate.
2. **One item flagged on language grounds**: `negation-preference-id` negates *liking* rather than *preferring* (see #328). It produced no false positive for either model.
3. **The high 'lost' rates dominate both results** and limit what the false-positive rates can be said to measure.
4. Latency is not reported here — it is not the question this run asks, and cross-model latency remains non-comparable per the #253 bundle.
