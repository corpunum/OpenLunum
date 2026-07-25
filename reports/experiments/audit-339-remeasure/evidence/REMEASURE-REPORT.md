# #339 — parse accuracy after #337's prompt vocabulary fix

- Code commit under test: `3e61142d6265325f25582f65e2c79a42d885e1d9` (#337 merged as `3e61142`, this run is on top of it)
- Generated: 2026-07-25T17:26:03.216448+00:00
- Same 16-item dataset, same manifests, same two models as #253. No dataset, manifest, or scorer change.
- Every figure below recomputed from raw per-item JSONL, not copied from any runner summary.

## Headline: before (#253) vs after (#337 fix)

| model | exact before | exact after | recall before | recall after |
|---|---|---|---|---|
| qwen36-35b | 9/16 (56.25%) | **15/16 (93.75%)** | 0.9319 | **1.0000** |
| qwen3-coder-30b | 4/16 (25.00%) | **16/16 (100.00%)** | 0.8299 | **1.0000** |

## Gates (stated as fact, not acted upon — #339 explicitly forbids calibration or further action here)

Declared gates: `minimumExactRate: 0.75`, `minimumFeatureRecall: 0.95`.

- `qwen36-35b`: exact 0.9375 >= 0.75, recall 1.0000 >= 0.95 -> **PASSES both declared gates**
- `qwen3-coder-30b`: exact 1.0000 >= 0.75, recall 1.0000 >= 0.95 -> **PASSES both declared gates**

Both models pass both declared gates on this measurement. This is a factual observation about
this specific 16-item, 4-language corpus. Whether this constitutes sufficient evidence to revisit
#253's calibration determination is an owner decision, explicitly out of this issue's scope.

## Per semantic group (the three groups #337 targeted, plus the untouched control)

| group | model | before exact | after exact |
|---|---|---|---|
| preference (control (unchanged by #337)) | qwen36-35b | see #253 report | 4/4 |
| delete (targeted) | qwen36-35b | see #253 report | 3/4 |
| battery (targeted) | qwen36-35b | see #253 report | 4/4 |
| deadline (targeted) | qwen36-35b | see #253 report | 4/4 |
| preference (control (unchanged by #337)) | qwen3-coder-30b | see #253 report | 4/4 |
| delete (targeted) | qwen3-coder-30b | see #253 report | 4/4 |
| battery (targeted) | qwen3-coder-30b | see #253 report | 4/4 |
| deadline (targeted) | qwen3-coder-30b | see #253 report | 4/4 |

`preference` (the one group whose worked example already matched gold before #337) was already at
100% in #253 for both models and remains unaffected here — consistent with #337 being the correct,
targeted cause rather than a broad prompt rewrite that happened to help everything.

## Residual failures

- `qwen36-35b` / `delete-el`: near=True score=0.8787878787878788, missingFeatures=[]

The one residual (`qwen36-35b` / `delete-el`) is unrelated to #337's targeted defect: every
vocabulary term #337 fixed (`confirmed`, `user`, `assistant`, `delete`) was emitted correctly. The
sole mismatch is `roles.object.type: "object"` vs gold's `"concept"` — a different, minor,
untouched role-type ambiguity, not evidence the #337 fix was incomplete.

## Known limitations of this measurement

1. **n=16 total, n=4 per language, n=4 per semantic group.** A jump from 25%/56% to 100%/93.75%
   on a 16-item corpus is a strong, clean signal given every failure clustered on exactly the
   predicted defect, but it is not a claim about performance at scale or on unseen semantic groups.
2. **Same corpus, not a held-out set.** This re-runs the identical #253 items. It confirms the
   diagnosed defect was fixed; it does not by itself establish generalization to new content.
3. **Single run, no repeated-sampling variance estimate**, consistent with #253's own methodology.
4. Endpoint identity verified before each run; router restarted between models; zero infrastructure
   errors; `attempt: 1` throughout (this measurement only covers parse, not retention).
