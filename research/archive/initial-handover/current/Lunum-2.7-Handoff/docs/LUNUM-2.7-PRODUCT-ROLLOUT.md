# Lunum-2.7 Product Rollout

## Phase 1 — storage only

Enable:

```text
LUNUM_MEMORY_CANONICALIZATION=true
LUNUM_RETRIEVAL_FP_BOOST=true
LUNUM_MEMORY_CONTEXT=false
```

Store Lunum fields but inject natural text.

## Phase 2 — shadow mixed

Enable:

```text
LUNUM_MEMORY_CONTEXT=false
LUNUM_CONTEXT_MODE=shadow_mixed
```

Compile mixed context, but do not use it for final answers. Log token savings and answer comparisons.

## Phase 3 — guarded mixed

Enable:

```text
LUNUM_MEMORY_CONTEXT=true
LUNUM_CONTEXT_MODE=mixed
```

Only for low-risk categories.

## Phase 4 — expansion

Expand categories only if failure rate stays below threshold.

## Stop conditions

Disable mixed context if:

```text
failure_rate > 3%
quality_delta < -0.05
conditional failures increase
safety/constraint answer changes
```
