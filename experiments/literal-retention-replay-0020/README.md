# Literal-retention replay for ADR 0020

Every recorded candidate in the repository (88 candidate/run ledgers; 221
unique source/candidate pairs) submitted to the core built from `origin/main`
before ADR 0020 (`4b1c4be`) and to the current core. Offline; no provider or
model calls; frozen evidence is only read.

Result: 174 identities before, 174 after; 0 withdrawn, 0 gained, 0 changed.
An earlier run of the same replay found one false refusal (`20 τοις εκατό`
read as the number 100); it is fixed and covered by a unit test. None of the
replayed sources that carry an identity contains a relative time, so this
replay shows no regression but cannot show a catch.

```sh
node scripts/research/replay-literal-retention-0020.mjs <baseline packages/core/dist/src/index.js> out.json
```

Self-reviewed.
