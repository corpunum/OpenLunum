# False-positive review: false-positive-review-332-qwen36-35b

- Run: 2026-07-25T18-16-09-570Z
- Baseline commit: 106ed90f8db5118ab32de870a0f4a2e7a8c778a3
- Mutation dataset sha256: 62295f30f64acfebc3f9a4e9dae7be3e8c2526aa48a70be20152d5b6bafecc16
- Source dataset sha256: 6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873
- Prompt sha256: b3286081cf4f65e4f92f16d4aad28d0842d38edd820c4ce061e696b846071165
- Items: 20 (planned 20)
- Parsed (schema-valid): 20
- Invalid model output: 0

## Overall

- False-positive rate (match against SOURCE gold, among parsed items): **5.0%** (1/20)
- Own-gold match rate (scorer correctly tracked the mutation's own change): 65.0% (13/20)
- Outcomes: correct=12, false_positive=0, false_positive_and_own_matched=1, lost=7

## By mutation category

| Category | Items | Parsed | False-positive rate | Own-gold match rate |
|---|---|---|---|---|
| extra-clause | 4 | 4 | 0.0% (0/4) | 0.0% (0/4) |
| literal | 4 | 4 | 0.0% (0/4) | 100.0% (4/4) |
| modality | 4 | 4 | 0.0% (0/4) | 100.0% (4/4) |
| negation | 4 | 4 | 0.0% (0/4) | 100.0% (4/4) |
| role | 4 | 4 | 25.0% (1/4) | 25.0% (1/4) |

## By language

| Language | Items | Parsed | False-positive rate | Own-gold match rate |
|---|---|---|---|---|
| el | 5 | 5 | 0.0% (0/5) | 60.0% (3/5) |
| en | 5 | 5 | 0.0% (0/5) | 60.0% (3/5) |
| es | 5 | 5 | 20.0% (1/5) | 80.0% (4/5) |
| id | 5 | 5 | 0.0% (0/5) | 60.0% (3/5) |

## Latency

- p50: 40957.49ms, p95: 62213.14ms, mean: 42100.65ms (20 attempts)

## Error taxonomy (invalid model output only; infrastructure errors invalidate the whole run and are not summarized here)

- None
