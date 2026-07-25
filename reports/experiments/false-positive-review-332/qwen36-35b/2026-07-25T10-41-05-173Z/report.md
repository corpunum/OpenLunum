# False-positive review: false-positive-review-332-qwen36-35b

- Run: 2026-07-25T10-41-05-173Z
- Baseline commit: 106ed90f8db5118ab32de870a0f4a2e7a8c778a3
- Mutation dataset sha256: 62295f30f64acfebc3f9a4e9dae7be3e8c2526aa48a70be20152d5b6bafecc16
- Source dataset sha256: 6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873
- Prompt sha256: d8383f9e1c4332c7539fd5d0652f10f058fe224dca6aa5dca8037de3f085891b
- Items: 20 (planned 20)
- Parsed (schema-valid): 20
- Invalid model output: 0

## Overall

- False-positive rate (match against SOURCE gold, among parsed items): **10.0%** (2/20)
- Own-gold match rate (scorer correctly tracked the mutation's own change): 35.0% (7/20)
- Outcomes: correct=7, false_positive=2, false_positive_and_own_matched=0, lost=11

## By mutation category

| Category | Items | Parsed | False-positive rate | Own-gold match rate |
|---|---|---|---|---|
| extra-clause | 4 | 4 | 0.0% (0/4) | 0.0% (0/4) |
| literal | 4 | 4 | 0.0% (0/4) | 75.0% (3/4) |
| modality | 4 | 4 | 50.0% (2/4) | 0.0% (0/4) |
| negation | 4 | 4 | 0.0% (0/4) | 100.0% (4/4) |
| role | 4 | 4 | 0.0% (0/4) | 0.0% (0/4) |

## By language

| Language | Items | Parsed | False-positive rate | Own-gold match rate |
|---|---|---|---|---|
| el | 5 | 5 | 0.0% (0/5) | 40.0% (2/5) |
| en | 5 | 5 | 0.0% (0/5) | 40.0% (2/5) |
| es | 5 | 5 | 20.0% (1/5) | 20.0% (1/5) |
| id | 5 | 5 | 20.0% (1/5) | 40.0% (2/5) |

## Latency

- p50: 46989.54ms, p95: 59331.63ms, mean: 45856.01ms (20 attempts)

## Error taxonomy (invalid model output only; infrastructure errors invalidate the whole run and are not summarized here)

- None
