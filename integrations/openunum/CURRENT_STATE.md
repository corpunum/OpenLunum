# OpenUnum current state

Baseline: `corpunum/openunum@18c11d8dc7aaf145366760ab949519065f4a735c`, inspected 2026-07-15.

## Present

- `src/memory/lunum.mjs` exports sidecar derivation and shadow context compilation.
- SQLite message columns: `lunum_code`, `lunum_sem_json`, `lunum_fp`, `lunum_meta_json`.
- Equivalent sidecars exist on plan and plan-step records.
- `lunum_shadow_logs` stores natural/mixed rough-token totals and ratio.
- Assistant responses and plan data can be persisted with sidecars.
- Natural message content remains available.

## Behavior at baseline

- The current code lowercases and strips outside ASCII letters/digits for its telegraph form.
- `lunum_sem_json` holds telegraph metadata rather than canonical semantic clauses.
- Fingerprints are based on the local telegraph output, not canonical language-independent meaning.
- Token estimates use character count divided by four.
- Chat history sent to the provider remains natural.
- `contextMode` is configured but does not yet constitute a mature live mixed-context switch.
- The main normal user-message persistence call does not generate a sidecar, whereas the assistant path does.

This is a useful shadow shell, not a complete Lunum implementation.
