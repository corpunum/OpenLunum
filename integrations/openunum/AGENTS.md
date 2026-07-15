# Instructions for agents adopting Lunum in OpenUnum

1. Read `integration.json`, `CURRENT_STATE.md`, `GAP_ANALYSIS.md`, and `ADOPTION_PLAN.md`.
2. Inspect the current OpenUnum tree; do not assume the recorded baseline is still current.
3. Preserve natural `messages.content` and existing `lunum_*` columns.
4. Add Lunum through a product-owned adapter and pinned dependency.
5. Do not copy product-specific database or config logic into `@corpunum/lunum`.
6. Treat existing `2.7-shadow` fingerprints as legacy surface fingerprints; never relabel them semantic without migration.
7. Keep live context natural until shadow quality and safety gates pass.
8. Add consistent user-message/consolidated-memory sidecars.
9. Run both repositories' tests and produce an adoption report listing changed files, schema versions, fallback rate, and measured results.
10. Never auto-enable `all_lunum`.
