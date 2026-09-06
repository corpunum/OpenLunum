# Codex-agent blind evaluation v1

This is an immutable diagnostic protected-shaped run against implementation
`e40a7be36fb1cef9626cc674fcfa3f410aa6d92d`.

The extraction worker (`McClintock`) received source text and extraction
contract rules only. Gold semantics, protected relationships, and scoring
metadata were kept in the evaluator process and were not sent to the worker.

Corpus authoring independence is reduced: two independent corpus proposals
failed preflight, so the parent authored the final valid corpus using the
frozen contract. This run must not be presented as fully independent corpus
evidence.

- corpus: `items.jsonl`
- corpus SHA-256: `7b8d92c1319bfc62d1ec1f5f33cec1278ab8eb9414bf1897adacf866f6328e03`
- critical pairs: `critical-negative-pairs.json` (6 definitions)
- preflight: PASS; gold convergence `8/8`; gold negative separation `6/6`
- run: `run/`
- public ledger: `run/agent-results.jsonl`
- evaluator-private ledger: `run.private/agent-results.jsonl`
- result: `protected-result.json`
- model calls: none; cognition source: isolated Codex subagent

After the first protected extraction call this directory and its corpus are
not to be edited or rerun as a clean capability claim.
