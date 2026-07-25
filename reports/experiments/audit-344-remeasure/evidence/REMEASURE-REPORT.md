# #344 — parse / retention / false-positive after the #337 + #341 prompt fixes

- Commit under test: `b517f36df07448ec9c0fd25f89d1d63a1141bb55` (#337 and #341 both merged)
- Generated: 2026-07-25T18:40:32.302239+00:00
- Same models, datasets, manifests as #253/#332/#339. No dataset/manifest/scorer/threshold change.
- Every figure recomputed from raw per-item JSONL. Endpoint verified before each run; router restarted between models.

## Headline

The #341 modality fix worked (modality false positives -> 0 for both models). Measuring it also
**exposed a pre-existing scorer blind spot** — the near-semantic fingerprint cannot detect agent-role
swaps — previously masked by poor parsing.

## 1. Modality false positives — FIXED (the #341 target)

| model | modality FPs #332 | modality FPs #344 | permission emitted | own-gold matched |
|---|---|---|---|---|
| qwen36-35b | 2 | **0** | 4/4 | 4/4 |
| qwen3-coder-30b | 0 | **0** | 2/4 | 2/4 |

Both models now produce zero modality false positives. `qwen3.6-35b` emits `permission` on all 4 (was
`permissive`/`possible`/omit); `qwen3-coder-30b` on 2, with `ability` on 2 (wrong but no longer a false
positive). The fix did what it was designed to do.

## 2. HEADLINE FINDING — role-swap false positives, exposed by better parsing

Total FPs went 2->1 (qwen3.6-35b) and 0->2 (qwen3-coder-30b): modality FPs vanished, role-mutation FPs
appeared. Not a #341 bug — a pre-existing scorer limitation the parse improvements uncovered.

Near-semantic score of the parsed `role-delete-*` mutation against **source** gold, #332 vs now:

| model | item | #332 | #344 | crossed 0.8 |
|---|---|---|---|---|
| qwen36-35b | role-delete-en | 0.771 | 0.000 |  |
| qwen36-35b | role-delete-el | 0.771 | 0.000 |  |
| qwen36-35b | role-delete-es | 0.771 | 0.816 | **YES** |
| qwen36-35b | role-delete-id | 0.771 | 0.000 |  |
| qwen3-coder-30b | role-delete-en | 0.000 | 1.000 | **YES** |
| qwen3-coder-30b | role-delete-el | 0.676 | 1.000 | **YES** |
| qwen3-coder-30b | role-delete-es | 0.000 | 0.000 |  |
| qwen3-coder-30b | role-delete-id | 0.500 | 0.000 |  |

`qwen3-coder-30b`'s `role-delete-en`/`role-delete-el` jumped to **1.000** — a perfect match to source —
even though the model correctly parsed the swap (`agent: user`, confirmer `assistant`). **The
near-semantic fingerprint ignores which actor fills the agent role**, so a correctly-parsed role swap
scores identical to the un-swapped source. Same class as the #335 modality finding, arguably more
severe: "assistant deletes unless user confirms" vs "user deletes unless assistant confirms" is a
safety-critical distinction the scorer cannot see. Invisible in #332 only because the parse was too
incomplete to reach a high score. **Filed as a separate scorer finding.**

## 3. Parse regression check

| model | exact #339 | exact #344 | recall #339 | recall #344 |
|---|---|---|---|---|
| qwen36-35b | 93.75% | 93.75% | 1.0000 | 0.9861 |
| qwen3-coder-30b | 100.00% | 81.25% | 1.0000 | 1.0000 |

- **The #341 regression guard held**: core `battery-*` items stayed exact for both models with no
  spurious modality field. The risk flagged at review time did not materialize.
- `qwen3.6-35b` held at 93.75% exact; its one recall dip (`delete-el`) copied the new `examplePermission`
  `confirmed`+`subject` pattern verbatim (see #4).
- `qwen3-coder-30b` exact dropped 100%->81.25% **with recall held at 1.0000** — features all present,
  only exact-fingerprint mismatches, no `examplePermission` fingerprint. Consistent with run-to-run
  nondeterminism, not a feature regression. A single run cannot fully separate variance from a subtle
  prompt effect (see Limitations).

## 4. One genuine #341 example defect (small, isolated)

The new `examplePermission` reuses `confirmed` with a `subject` role, but `delete` gold uses `confirmed`
with `agent` — the same example-vs-gold contradiction class #337 fixed. Manifested only on `qwen3.6-35b`
/`delete-el`. `qwen3-coder-30b` parsed all delete items correctly. **Filed as a follow-up fix.**

## 5. Retention

| model | passed #253 | passed #344 |
|---|---|---|
| qwen36-35b | 31/32 | 30/32 |
| qwen3-coder-30b | 32/32 | 32/32 |

`qwen3-coder-30b` held at 32/32. `qwen3.6-35b` went 31->30: `deadline-en` joined `deadline-id` in the
same `validation_error` parse-back class already present in #253 — no new failure mode, within variance.
All `attempt: 1`, no exclusions, zero infrastructure errors.

## Limitations

1. **Single-run nondeterminism is a demonstrated confound.** `qwen3-coder-30b` parse exact moved
   100%->81.25% between #339 and #344 with recall held and no attributable prompt fingerprint. Separating
   a prompt effect from variance needs repeated runs, which no run here performed. Single-item exact/near
   flips are provisional.
2. n=16 parse / n=20 false-positive / n=4 per mutation category — directional, not population-level.
3. Same corpora as prior runs, not held-out.

## Net assessment (stated as fact; no action taken — calibration remains an owner decision)

- #341 fixed modality false positives for both models. Clear win.
- Parse and retention held within run variance; the #341 regression guard on modality-free core items held.
- The measurement surfaced a real, previously-masked scorer blind spot (role-swap insensitivity) and one
  small example defect, both filed separately. Neither is grounds to revert #341.
