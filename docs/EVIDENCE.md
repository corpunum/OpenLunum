# Evidence, results, and achievements

This ledger distinguishes reproducible repository tests from historical target-machine reports.

## Demonstrated achievements

1. The early semantic-first representation supported structured canonical records and exact deduplication concepts but expanded prompt size substantially.
2. Separating semantics from tokenizer-facing rendering solved the architectural conflict between language independence and compression.
3. Telegraph-style renderings using familiar tokens outperformed punctuation-heavy symbolic forms on the tested SuperGemma tokenizer.
4. Validators reached 90/90 on the 2.5.1 controlled corpus after registry repair.
5. Corrected comprehension scoring showed context savings with no average quality loss in one mode and a small positive delta in completion mode.
6. In the 2.6 multi-memory gate, mixed context preserved perfect QA in both tested modes, while full-Lunum lost part of one conditional instruction in completion mode.
7. The portable 2.7 static package passes its rough-token and fallback assertions.

## Historical metrics

| Version | Metric | Result | Provenance |
|---|---|---:|---|
| 1 / 0.2 | size ratio | ~5.78× expansion | archived benchmark/report |
| 2.3 | Safe-Min | ~0.847× | user local target-tokenizer report |
| 2.3 | Short-Min | ~0.829× | user local target-tokenizer report |
| 2.4 | Safe / Short / Tight | 0.882 / 0.801 / 0.776× | user local SuperGemma report |
| 2.4 | validation | 30/30 | user local report |
| 2.5 | Safe / Short / Tight | 0.7971 / 0.7336 / 0.7244× | 30-example local report |
| 2.5 | wins | 28/30, 29/30, 29/30 | local report |
| 2.5.1 | validators | 90/90 smoke and strict | local report |
| 2.5.4 | context ratio | 0.7434× | corrected comprehension harness |
| 2.5.4 | full prompt ratio | 0.9195× | corrected comprehension harness |
| 2.5.4 | quality delta | 0.00 default, +0.05 completion | corrected harness |
| 2.6 | natural/Lunum/mixed tokens | 270 / 207 / 217 | exact local SuperGemma counts |
| 2.6 | Lunum/mixed ratio | 0.7667 / 0.8037× | exact local counts |
| 2.6 | default QA | 1.0 / 1.0 / 1.0 | natural/Lunum/mixed |
| 2.6 | completion QA | 1.0 / 0.9 / 1.0 | full-Lunum conditional loss |
| 2.7 | rough natural/Lunum/mixed | 137 / 98 / 103 | portable static fixture |
| 2.7 | rough ratios | 0.715 / 0.752 | Lunum/mixed |

Machine-readable history is in `eval/historical-results.json`; original reports are under `research/archive/`.

## Not demonstrated yet

- production-grade language-agnostic parsing;
- broad semantic equivalence across many languages and domains;
- universally optimal compact code;
- stable gains across all current provider tokenizers;
- production safety at scale;
- collision-resistant near-semantic matching beyond exact canonical hashes;
- reliable replacement of natural context for complex instructions;
- benefits of a Lunum-native trained model.

## Required reporting fields for new results

- Lunum package, schema, and renderer profile versions;
- model and tokenizer identifiers;
- corpus and query counts;
- natural, Lunum, mixed, and full-prompt token counts;
- downstream quality and error taxonomy;
- exact prompt scaffolding;
- hardware/runtime where relevant;
- reproduction command and artifact hashes.
