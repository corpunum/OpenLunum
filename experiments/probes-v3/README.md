# Probes v3: verb vocabulary and permission without a permitter

Frozen 2026-09-26, **before** the verb-alias table (decisions/0011) was written and before any run against it. The set shares no sentences or verbs with V8 or probes v1/v2.

16 sentences (10 English, 6 Greek), scored by outcome only:
- Verb-only `allow`/`prohibit` with verbs a general alias table should cover (modify, remove, execute, inspect): expected `parse`.
- Verbs that no registered predicate expresses (print, whistle): expected `abstain`.
- Permission with no stated permitter ("is permitted to", "may", `επιτρέπεται`): expected `parse`, which under frame 0.3 means modality `permission` on the action's own frame (decisions/0010).
- `allow` with neither an action nor an object: expected `abstain`.

**Contamination note:** the same agent wrote this set and the alias table. The verbs were chosen as common access and control verbs before the table existed, but the author knew a table was coming. Treat the results as a check that the mechanism works live, not as evidence of vocabulary coverage. Self-authored; the Greek has not been reviewed by a human.
