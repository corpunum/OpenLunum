# Security policy and threat model summary

Lunum may influence model context, memory retrieval, plans, and tool decisions. A malformed or poisoned record can therefore have effects beyond ordinary compression bugs.

## Primary risks

- semantic loss, especially negation, conditions, conjunctions, modality, entities, quantities, and temporal constraints;
- fingerprint collision or incorrect equivalence causing memory substitution;
- prompt injection stored inside source text or Lunum fields;
- unsafe renderer output interpreted as an instruction rather than data;
- stale renderer profiles applied to different tokenizer/model versions;
- product adapters bypassing natural fallback or user confirmation;
- untrusted MCP/plugin integrations gaining excessive filesystem or credential access.

## Required controls

- retain original source and provenance;
- validate schema and canonical form before fingerprinting;
- namespace fingerprints by canonicalization version;
- treat Lunum records as untrusted data at integration boundaries;
- keep safety constraints and exact instructions natural until specifically proven safe;
- use allowlists for compact-eligible categories;
- log representation choice and renderer profile;
- permit instant fallback to natural context;
- pin dependency versions and run integration contract tests before upgrades.

Report private vulnerabilities to the repository owner. Do not publish exploitable integration details before coordination.
