# Codex / Local Agent Plan for Lunum-2.7

1. Unpack `lunum2_7_handoff.zip`.
2. Run:
   ```bash
   node scripts/run_static_tests_2_7.mjs
   ```
3. Run tokenized shadow check:
   ```bash
   node scripts/shadow_eval_2_7.mjs --server http://127.0.0.1:18084
   ```
4. Review:
   - `reports/context_compile_2_7.json`
   - `reports/shadow_eval_2_7.static.json`
   - `reports/static_tests_2_7.json`
5. Integrate migrations only after review:
   - `migrations/001_lunum_memory_columns.sql`
   - `migrations/002_lunum_shadow_logs.sql`
6. Implement into product:
   - eligibility classifier
   - context compiler
   - feature flags
   - shadow logging
7. Do not enable user-visible mixed mode until shadow logs are healthy.
