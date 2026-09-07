# OpenUnum adoption plan

## Phase 0 — independent validation, no OpenUnum edits

- Run OpenLunum core and integration contract tests.
- Import representative OpenUnum fixtures read-only.
- Compare the local module with `@corpunum/lunum` outputs.
- Establish migration policy for existing `2.7-shadow` sidecars.

## Phase 1 — dependency and adapter

1. Add an exact pre-1.0 dependency on `@corpunum/lunum`.
2. Replace local language logic with a small `src/memory/lunum-adapter.mjs`.
3. Keep the current `deriveLunumSidecar` and `compileLunumShadowContext` call shape.
4. Preserve natural content and existing columns.
5. Run OpenUnum unit tests and the OpenLunum contract suite.

## Phase 2 — persistence consistency

- Derive sidecars for normal user messages or consolidate them asynchronously under a clearly defined policy.
- Record schema, canonicalization, fingerprint, and renderer versions in metadata.
- Add a backfill command; do not mutate old fingerprints silently.

## Phase 3 — richer shadow evaluation

- Compile mixed context from retrieved records but continue serving natural context.
- Record exact tokenizer counts when available.
- Compare natural/mixed answers and log entity, negation, condition, conjunction, and safety failures.

## Phase 4 — retrieval augmentation

- Add exact Lunum-FP matches and predicate/role structural signals as boosts.
- Keep embeddings, lexical retrieval, freshness, and importance.
- Measure false equivalence and missed equivalence.

## Phase 5 — guarded mixed context

- Enable only allowlisted categories with high confidence and low risk.
- Keep conditionals, safety constraints, exact text, code, commands, paths, legal/medical language, and nuanced social meaning natural.
- Make rollback a configuration change, not a migration.

## Upgrade flow

```text
Lunum release → dependency update branch → contract tests → OpenUnum tests
→ shadow comparison → explicit approval → rollout
```

Do not track OpenLunum `main` in production.
