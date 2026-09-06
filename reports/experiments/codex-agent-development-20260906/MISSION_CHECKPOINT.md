# MISSION CHECKPOINT — CONTINUATION REQUIRED

Recorded: 2026-09-06T16:50:00+03:00
Mission start epoch: 1788697989
Current local branch: main
Current HEAD: 2c5b90d3698b14f28732341fdb3e5f35b910880f

## Scope and prohibitions

OpenLunum only. No OpenUnum files were inspected or changed. No llama.cpp,
localhost LLM endpoint, local inference model, or local embedding model was
used.

## Completed this continuation

- Reconstructed and committed the full real OMW/CILI development report:
  150 cases, 100 cross-language, zero unexplained failure categories.
- Added frame-derived `buildCandidateSem`, `lunum_build_candidate`, and
  `build-candidate` CLI workflow.
- Hardened builder required-role, exclusivity, alias-collision, typed-term,
  schema, and frame checks.
- Sanitized MCP blind `eval_next` to a source-only whitelist.
- Added provider-neutral `createMorphologyAugmentedProvider`.
- Acquired and probed real UniMorph snapshots for en/el/es/fr/id.
- Added explicit `intersectGroundingCandidateSets` with provider-error fail
  closed behavior, explicit relation requirement, namespace compatibility,
  and merged evidence.
- Corrected the unbiased UniMorph probe to sample surface/POS observations,
  pass POS symmetrically to raw and morphology paths, and record real
  per-language snapshot hashes. Its output remains OMW-derived coverage
  diagnostics, not independent accuracy.
- Added identity coverage and conditional retrieval denominators to the raw
  text evaluator.
- Ran a diagnostic agent-candidate retrieval harness; its candidate ledger
  reproduces gold-shaped paired semantics and is not clean extraction evidence.
- Added deterministic tests and research artifacts.
- `pnpm verify`: PASS, exit 0.
- `git diff --check`: PASS.
- Latest full `pnpm verify`: PASS, exit 0 (after retrieval metric changes).
- Added resolver-namespace and materialization provenance gates; provider
  status-inconsistent intersections, explicit-POS morphology overrides, and
  analyzer exceptions now fail closed. Core suite after these fixes: 1,796
  pass, 0 fail.
- Independent UD morphology audit: 500 observations across EN/EL/ES/FR/ID;
  49 unique OMW-eligible gold identities, 23 augmented singleton identities,
  23/23 correct, candidate-set recall 244/500, zero false singleton outputs
  among eligible cases. German UD was acquired but OMW identity scoring was
  unavailable because its OdeNet tab was absent from cache.
- Resolver results are now bound to the original grounding fingerprint and
  proposal during materialization. Raw retrieval is exact by default; near
  semantic matching is explicit opt-in. Eval suite after this change: 1,874
  pass, 0 fail.
- Re-ran the diagnostic agent-candidate retrieval harness in exact mode:
  identity coverage 11/12 queries and 10/10 memories; exact and conditional
  recall 4/10, EN↔EL 50%, ES↔EN 0%, zero false positives. The candidate ledger
  remains gold-shaped, so this is evaluator/precision evidence only.
- Added a replayable OMW failure decomposition for all 100 cross-language
  pairs. It records 100/100 source and target lexical coverage, 100/100 shared
  candidate coverage, 19 independent convergences, and 81 ambiguity-driven
  cases; no pair is unexplained. EN-EL is 1/20 (12 source-only ambiguous, 2
  target-only ambiguous, 5 both ambiguous).
- Exposed `atLeastOneOf` frame requirements through the typed builder and MCP;
  `retry` now reports its alternative minimum target without changing the
  semantic validator. Core/MCP focused tests pass.
- Core unit suite after intersection: 1,792 pass, 0 fail.
- MCP unit suite after builder/leakage hardening: 56 pass, 0 fail.
- CLI unit suite after builder command: 189 pass, 0 fail.

## Evidence

- Real OMW cross-language: 19/100 independent exact convergence; all 100 have
  both candidate coverage and a shared candidate; 78 have one shared candidate
  and 22 retain multiple candidates.
- UniMorph conditioned coverage probe: 2,500 forms with an attested lemma and
  unique exact OMW identity; raw exact 33, morphology exact 2,144,
  morphology ambiguous 16; 125 distinct-identity safety pairs, zero false
  equivalences. This is not unbiased morphology accuracy.
- Frame-first Codex development trial: Hooke 7 accepted + 1 abstention;
  Bernoulli 5 accepted + 2 abstentions + 2 rejected outputs. Identity
  availability is not semantic exactness.

## Current decision

Keep the typed builder, morphology adapter, and explicit candidate-set
intersection. Do not enable external morphology as an unconditional exact
provider or change semantic frames. No fresh protected corpus is justified.
The diagnostic agent retrieval result is not clean extraction evidence because
its candidate ledger reproduced gold-shaped paired semantics. Training is not
yet proven necessary.

## Next exact work

1. Obtain independent morphology/grounding labels; current UniMorph labels are
   circular with OMW and cannot prove analyzer precision.
2. Use genuinely source-only Codex agents on a fresh common development set
   through the typed builder; compare free-form, frame-first, and
   morphology-assisted construction with deterministic stage attribution.
3. Repeat raw-text retrieval with a candidate ledger independently generated
   from source text and contract only; the current ledger is harness-only.
4. Use an independent adversarial agent to attack morphology and candidate-set
   intersection before deciding whether training is genuinely justified.
5. Only after those results, consider a new protected corpus.

## Hourly checkpoint decision

Elapsed at recording: approximately 85 minutes. Completed real-resource
coverage, unbiased/corrected morphology probes, candidate-set analysis,
agent-native builder trials, diagnostic retrieval harness, and trust-boundary
hardening. Highest-leverage next action is an independently authored source-only
text-to-Sem benchmark with the generated frame contract, followed by explicit
contextual candidate-set scoring and retrieval. Do not create protected data.

## Uncommitted state

Only the research ledger/checkpoint updates are pending; unrelated dirty files
and historical diagnostic directories shown by `git status` are preserved.
