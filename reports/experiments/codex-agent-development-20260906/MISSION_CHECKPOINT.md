# MISSION CHECKPOINT — CONTINUATION REQUIRED

Recorded: 2026-09-06T15:59:00+03:00
Mission start epoch: 1788697989
Current local branch: main
Current HEAD: 12ede8ea6d9d041f3382a6654fbd086e88f07dac

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
  closed behavior.
- Added deterministic tests and research artifacts.
- `pnpm verify`: PASS, exit 0.
- `git diff --check`: PASS.
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

## Next exact work

1. Build an unbiased 100+ development morphology benchmark with held-out
   surface forms, language/POS partitions, and explicit hard negatives.
2. Use source-only Codex agents on that common set through the typed builder;
   compare free-form, frame-first, and morphology-assisted construction with
   deterministic stage attribution.
3. Add an explicit cross-language raw-text retrieval development run using
   agent-produced candidates only; report identity coverage, conditional and
   end-to-end recall against lexical baseline.
4. Use an independent adversarial agent to attack morphology and candidate-set
   intersection before deciding whether training is genuinely justified.
5. Only after those results, consider a new protected corpus.

## Uncommitted state

No uncommitted OpenLunum changes. Preserve unrelated dirty files and historical
diagnostic directories shown by `git status`.
