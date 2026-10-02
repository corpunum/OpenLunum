# Main-only branch reconciliation

Owner requested main-only work and exploration of old branches before merging.
Baseline `7470a2322a686ee4d3d6558b77d31b20f7ea8b6c`; fetched remote main
`3e42fc665aa10c7c82d53f6686c5e92e602dbf7c` is **two commits behind**, not ahead.
Remote has no other branch refs after fetch/prune.

The [inventory](main-branch-inventory.json) records 27 non-main local refs:
two ancestor tips, sixteen patch-equivalent histories, and nine histories with
unique patch IDs. Patch IDs alone are insufficient: a parent review following
a read-only Luna audit found the useful content of all nine already represented
by later integration/squash commits on main:

| Old branch | Existing main integration / disposition |
|---|---|
| agent/qwen/eval/context-size-bytes | `bd701aa`: identical byte-count helper integration; compaction remains parked |
| backup/local-pre-squash-20260914 | `31d9b6e`, `fa4bba0`: source-only provenance and V7 packet alignment |
| local-replay-before-squash | `aca2955`, `4bbf631`, `3803df6`: preserved replay evidence and later diagnostics |
| stage3-openlunum-semantic-contract-eval-20260901 | `6b4c137`: historical corpus/run byte-identical on main, with explicit evidence limitations |
| work/luna/685-v7-baseline | `efd9ca8`: baseline and independent rejection retained |
| work/luna/685-v7-iteration4 | `e24c9fd`, `fa4bba0`: bounded iteration evidence retained |
| work/luna/685-v7-provenance | `31d9b6e`: artifact-bound report retained |
| work/pi/488-tenant-isolation | `565e7b0`: later full integration including barrel export |
| work/pi/490-evidence-lineage | `fd2cb26`: later full integration and tests |

No additional merge is needed. No branches/worktrees were created, checked out,
deleted or modified. Old local refs and linked worktrees are left as historical
recovery points; all active implementation and publication stay on main. This
does not promote Stage 3/V7 diagnostic evidence into qualified capability.

Unrelated user edits are outside this changeset. Before isolation they were
archived and all 40 file hashes verified, with one source deletion recorded.
Restoration is verified again after publication; no reset, stash, clean,
force push, model run or external OpenUnum change is part of this work.
