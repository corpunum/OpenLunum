# Threat model

## Assets

Natural source evidence, canonical semantic records, fingerprints, model context, retrieval ranking, plans, tool decisions, user preferences, and product databases.

## Adversaries and failures

- malicious source content attempting persistent prompt injection;
- compromised plugins or MCP servers;
- accidental parser hallucination;
- renderer ambiguity;
- schema drift and stale fingerprints;
- product integration bugs;
- unsafe automatic dependency upgrades;
- model-specific misunderstandings.

## Safety invariants

1. Original evidence remains available.
2. Compact code never silently becomes the only record.
3. Low-confidence or high-impact content falls back to natural.
4. A fingerprint identifies canonical semantics under a named version, not truth.
5. Products remain responsible for authorization and tool safety.
6. Integrations must be removable without destroying product data.
