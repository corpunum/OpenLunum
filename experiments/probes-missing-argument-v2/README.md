# Missing-argument probes v2

Frozen 2026-09-26, before any extraction run against it. The probes are out of sample for contract `lunum-agent/0.5` and share no sentences with V8 or probes v1. They deliberately cover the weak spot found in v1 (allow/prohibit with a verb complement) with different verbs and entities.

- 20 sentences in 10 pairs. In each pair one sentence omits a role its frame requires (`expectedOutcome: abstain`) and the other states it (`parse`). 12 are English, 8 Greek. Frames: allow, prohibit, request, disable, rotate, receive.
- `requests.jsonl` is what the extractor sees: opaque handle, language and text, ordered by handle so position does not reveal the expected outcome. `private-expectations.jsonl` is never shown to the extractor.
- Scoring is by outcome only: a parse counts when a submission was accepted with identity, and an abstain counts when the extractor abstained. There are no target Sem objects, so correct parses are not checked for exact meaning.

**Review status:** authored by an AI agent (Claude Code). The Greek sentences have **not** been reviewed by a human native speaker. The expected outcomes are the author's judgment. Treat this as a diagnostic probe, not reviewed evaluation data.
