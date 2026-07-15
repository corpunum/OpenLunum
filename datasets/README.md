# Datasets

`dev/` and `adversarial/` are visible to worker agents. `protected/` contains only policy and manifests in Git; protected contents should be stored separately and exposed to an evaluator after a candidate is frozen. See `docs/DATASET_POLICY.md`.

`multilingual-core-v1.jsonl` deliberately maps English, Greek, Spanish, and Indonesian paraphrases to shared gold semantics. It is a bootstrap corpus, not evidence of production language support.
