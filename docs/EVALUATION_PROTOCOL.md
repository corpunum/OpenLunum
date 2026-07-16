# Evaluation protocol

Lunum has no single score. Each candidate receives a scorecard with hard gates and optimization metrics.

## Hard gates

- Schema validity and canonicalization determinism.
- Source/provenance retention.
- Entity and reference preservation.
- Negation, condition, quantity, time, and modality preservation where present.
- Safety/exact-content fallback.
- Fingerprint stability for unchanged semantics.
- Integration contract compatibility for affected products.

## Optimization metrics

- Exact target-tokenizer context and full-prompt tokens.
- Parse structural match and feature-level scores.
- Realization protected-literal coverage and independent semantic score.
- Natural/Lunum/mixed downstream task quality.
- Retrieval precision/recall and false-equivalence rate.
- Latency, throughput, memory, energy where measurable, and operational error rate.

## Multilingual evaluation

Report each direction separately: `language -> Sem` and `Sem -> language`. A model supporting a language in chat does not prove a Lunum parser or realizer profile supports it. Every support claim identifies model, prompt/profile, dataset, language direction, and known failures.

## Round trips

Round-trip similarity is secondary evidence. The same model can make a mistake and reproduce it consistently. Protected sets should include gold semantics, independent scoring, or human review for important categories.

## Aggregation

Publish per-item results and stratify by category and protected feature. A mean score must not hide one catastrophic safety or conditional failure.
