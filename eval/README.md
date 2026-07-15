# Evaluation

Lunum evaluation must cover more than compression.

## Required dimensions

- exact tokenizer counts;
- context-only and full-prompt ratios;
- semantic retention, including entities, negation, quantities, modality, time, conditions, and conjunctions;
- downstream task/QA quality;
- natural fallback rate;
- collisions and false equivalence;
- latency and compute overhead;
- safety failures;
- renderer/model/version reproducibility.

`historical-results.json` records prior evidence without upgrading historical claims to freshly reproduced results.
