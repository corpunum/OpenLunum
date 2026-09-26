# Missing-argument probes v1

Frozen 2026-09-26, before any extraction run against it. The probes are out of sample for task profile iteration 3 and for decisions/0007, and they share no sentences with V8.

- 20 sentences in 10 pairs. In each pair one sentence omits a role its frame requires (`expectedOutcome: abstain`) and the other states it (`parse`). 12 are English, 8 Greek. Frames: allow, send, publish, enable, deploy, copy.
- `requests.jsonl` is what the extractor sees: opaque handle, language and text, ordered by handle so position does not reveal the expected outcome. `private-expectations.jsonl` is never shown to the extractor.
- Scoring is by outcome only: a parse counts when a submission was accepted with identity, and an abstain counts when the extractor abstained. There are no target Sem objects, so correct parses are not checked for exact meaning.

**Review status:** authored by an AI agent (Claude Code). The Greek sentences have **not** been reviewed by a human native speaker. The expected outcomes are the author's judgment. Treat this as a diagnostic probe, not reviewed evaluation data.
