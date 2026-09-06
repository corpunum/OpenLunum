# MISSION CHECKPOINT — CONTINUATION REQUIRED

Recorded: 2026-09-06T19:27:30+03:00
Mission start epoch: 1788697989
Current local branch: main
Current HEAD: 6dda38287b2f9e5b9034f8ce76bbfbaffbf7ca37

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
- Ran a clean source-only frame-first trial with two isolated Codex agents on
  12 fresh multilingual cases. Each submitted 10 candidates and 2 abstentions;
  deterministic core accepted 9/10 for identity in each agent. Agent A
  converged on 3/3 multilingual groups and Agent B on 1/3. Greek and Spanish
  open-concept naming diverged; the result is development diagnostic only.
- Hardened stable-ID grounding against malformed IDs, direct resolver
  exceptions, and identical bare IDs from different namespaces. Core suite is
  1,798/1,798 after rebuilding the package.
- Added cascade-level validation for arbitrary provider results, so malformed
  status/provenance/candidate evidence cannot escape as `resolved_exact`.
  Core suite is 1,799/1,799.
- Rebuilt and reran the complete repository gate after the provider safety
  changes: `pnpm verify` passed with exit 0 and `git diff --check` passed.
- Hardened the OMW tab importer to classify malformed mapped/unmapped rows
  before coverage lookup; core suite is 1,801/1,801 after rebuild.
- Full `pnpm verify` after the importer/cascade changes passed with exit 0;
  evaluation smoke remained 16 items across 4 groups.
- Re-acquired OdeNet v1.4 with verified archive SHA
  `d55407c48056ab3bc20d14d4d376de1799541fa0c9e34a82617dbb531c67ba2b` and
  replayed the real resource benchmark to `/tmp`; result was unchanged at
  34/150 total convergence, 19/100 cross-language, EN-EL 1/20, zero resource
  false equivalences. Replay output SHA is recorded in the research ledger.
- Audited DBnary and Wikidata Lexeme resources. Neither provides a safe
  universal exact identity layer beyond pinned provider evidence; no new exact
  adapter was added. Findings are in `external-resource-research-20260906.json`.
- WN-LMF importer now counts truncated lexical-entry starts as malformed;
  rebuilt core suite passes 1,802/1,802.
- A fresh 18-item batch-array trial failed transport parsing in both agents due
  to one trailing comma. The same items were rerun as strict JSONL: Dirac
  submitted 16/18 and Heisenberg 15/18; every submitted candidate passed all
  deterministic gates. Indonesian enable was the main agent disagreement.
  Results are diagnostic in `source-only-frame-first-trial-v3.json` and `v4`.
- An adversarial audit found that singleton candidate intersections were being
  mislabeled as exact identity. They now return `candidate_narrowed`, and the
  OMW replay reports 78 narrowed cases while preserving 19 independent exact
  cases. Core unit suite and full `pnpm verify` pass after this repair.
- A follow-up regression now proves a `candidate_narrowed` result is rejected
  by `toGroundingResolution` rather than materialized as exact identity.
- The independent UD/UniMorph morphology replay remains reproducible with the
  same low OMW eligibility and zero false singleton identities; no resource
  or semantic score is being inflated by the intersection repair.
- Retrieval identity coverage now requires successful `semanticFingerprint`,
  not only structural normalization. Focused evaluation passes 1,875/1,875;
  critical-negative safety tests count only identity-comparable pairs.
- Added a reusable blind-agent ledger validator enforcing opaque source-handle
  coverage, recursive evaluator-field leakage rejection, strict normalization,
  and lfp:2.1 identity before coverage is counted. Evaluation suite passes
  1,878/1,878.
- Wired the validator into the retrieval harness. It rejects the historical
  candidate ledger because 13/22 candidates fail current lfp:2.1 identity;
  no historical report was rescored.
- A tool-driven builder trial produced six valid builder inputs; all six
  deterministic submissions passed protocol/frame/grounding/identity gates,
  with three multilingual pairs converging. This is construction evidence,
  not source-text exactness evidence.
- Closed a genuine exported-helper trust bypass: direct forged provider
  results and forged registry resolutions can no longer mint exact identity.
  Provider-cascade and resolution capabilities are private, in-process
  brands; serialized evidence must be re-authenticated. Core 1,803/1,803,
  evaluator 1,878/1,878, MCP 58/58, and workspace verification passed.
- Added a non-circular UniMorph audit scored directly against independent UD
  lemmas: 353/600 candidate-set recall, 331/333 unique precision, with
  per-language recall EN 51%, EL 44%, ES 92%, FR 42%, DE 65%, ID 58%.
  Morphology remains candidate generation, not exact identity proof.
- Hardened authenticated grounding objects against post-validation mutation:
  contained provider results and minted resolutions are cloned/frozen before
  capability branding; serialized and forged objects remain rejected.
  Focused security suite is 34/34 and the full workspace gate passed.
- Replayed the independent UD/UniMorph morphology audit with the pinned
  German OdeNet WN-LMF snapshot through the existing importer: German
  augmented identity was 19/100 with 19/19 unique outputs correct and 67/100
  candidate-set recall. German is now measured rather than marked unavailable.
- Corrected the current morphology research note so the historical circular
  identity probe is distinguished from the non-circular UD lemma audit and no
  longer claims German identity evidence is unavailable.
- Repaired retrieval metric denominators: only lfp:2.1-usable memories count
  as comparable candidates, and query abstentions/empty identity pools no
  longer count as negative safety successes. Evaluator suite is 1,880/1,880.
- Hardened retrieval/blind input validation for duplicate and unknown IDs,
  malformed source entries, bounds, routing references, and invalid baseline
  partial output. Evaluator suite is now 1,882/1,882.
- Ran a fresh source-only comparison with the exact generated contract: two
  isolated agents returned mostly builder-shaped records and abstained on
  unsupported cases, but still diverged on preference roles, modality/time
  terms, and open-concept naming. This is transport/convergence diagnostics,
  not gold-scored extraction evidence.
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

Elapsed at recording: approximately 120 minutes. Completed real-resource
coverage, unbiased/corrected morphology probes, candidate-set analysis,
agent-native builder trials, diagnostic retrieval harness, and trust-boundary
hardening. Highest-leverage next action is an independently authored source-only
text-to-Sem benchmark with the generated frame contract, followed by explicit
contextual candidate-set scoring and retrieval. Do not create protected data.

## Latest continuation updates

- Blind candidate provenance can now bind a candidate to the SHA-256 of its
  source text; mismatches fail closed before retrieval metrics (358de09).
- Typed builder validation now recurses through nested conditions and
  consequences, and the CLI contract declares grounding input (dcfb2f0).
- Retrieval inputs, routing references, identity-only candidate pools, and
  invalid baseline handling are hardened (055cc3d).
- The exact-contract source-only extraction trial remains diagnostic only;
  no gold or expected semantic data was exposed (d185cae).
- Fixed raw-text retrieval leakage: extractor callbacks now receive only the
  raw source fields, never expected or equivalent-memory labels; added a
  regression (6270c4c).
- Corrected language-pair retrieval false-negative denominators to use routed,
  identity-usable candidate pools.
- Added exact public/private durable-ledger key validation and an in-flight
  submission guard; concurrent duplicate submissions now fail closed.
- Made the MCP compatibility fingerprint response explicitly report
  `identityScope=legacy-compatibility` and `semanticIdentity=false`; lfp:2.1
  hashing remains available only through the contained submission path.
- Added explicit `semanticIdentityExact` to `compareSem` while preserving the
  legacy `exactFingerprint` field; evidence-only annotations are now covered
  by a regression proving the distinction.
- Scoped verification passed: core 1,806/1,806, evaluator 1,885/1,885,
  MCP build/tests, and core/eval/CLI/MCP typechecks; evaluator smoke reported
  16 items across 4 groups. Root recursive verification remains intentionally
  avoided because it traverses out-of-scope adapter-openunum.
- Corrected the legacy parse runner's primary exact scoring to use
  lfp:2.1 `semanticFingerprint`; `legacyExact` remains diagnostic and the
  explicit `semanticIdentityExact` field is persisted. Eval suite remains
  1,885/1,885.
- Added opt-in strict source-bound validation for blind candidate ledgers;
  missing source hashes now fail closed in strict mode while historical
  diagnostic compatibility remains available. Eval suite is 1,886/1,886.
- Final scoped gates in this continuation: CLI 189/189, evaluator
  `verify:strict` 1,886/1,886 plus smoke and typecheck, and MCP typecheck all
  passed. No root recursive verify was run because it traverses out-of-scope
  adapter-openunum.
- Retrieval harness now requires worker-supplied source-bound provenance and
  refuses to manufacture hashes. Running it against the historical diagnostic
  ledger fails closed on missing source hashes and non-identity candidates;
  no report was overwritten (45af4be).
- Added a positive strict-custody fixture proving a complete source-bound
  candidate ledger passes validation with exact opaque-handle coverage and no
  scoring leakage; evaluator suite is 1,887/1,887.
- Reconciled research-ledger commit references for the parse-runner, strict
  custody, and positive custody milestones; no evidence status was changed.
- A fresh isolated source-only Codex trial with explicit protocol enumerations
  corrected the invalid world but still emitted `terms`/`frame` wrappers
  instead of direct builder fields. Seven records failed builder transport;
  no gold or expected semantics were exposed. Keep this diagnostic result and
  do not weaken the typed builder contract.
- The trial is recorded as transport diagnostics only; it produced no clean
  retrieval or semantic-capability evidence.
- The next exact corrective action is a tool-driven MCP builder interaction;
  free-form agent output continues to invent wrapper shapes even when the
  protocol enumerations are explicitly supplied.
- Tightened the builder/MCP transport boundary: unknown direct-builder fields
  now fail explicitly and the MCP schema forbids alternate wrapper fields.
  Core remains 1,806/1,806 and MCP 59/59.
- Read-only API audit: `/parse` still fabricates a default Sem from raw text
  and `/retrieve` remains an empty placeholder path. Neither is accepted as
  empirical extraction/retrieval evidence; no API files were changed.
- API regression gate passed: 202 unit tests, build, and typecheck. This
  confirms the legacy surface is stable but does not upgrade it to semantic
  extraction evidence.
- A tightly constrained direct-field Codex trial on three fresh English
  sources produced 3/3 transport-, protocol-, frame-, grounding-, and
  identity-valid candidates. The diagnostic artifact records exact source
  hashes and lfp:2.1 outputs, but no gold or semantic accuracy claim.
- A fresh source-only multilingual direct-field trial covered six equivalent
  preference sentences (EN/EL/ES/FR/DE/ID). The agent returned `roles` as a
  comma-separated string and used language tags as `world`; all 6/6 were
  correctly rejected by the strict builder. No gold or expected identity was
  exposed, so this is transport diagnostic evidence only. The builder was not
  broadened.
- Clarified the generated builder contract to distinguish semantic `world`
  from source language and to require `roles` as an object of typed terms;
  core build/typecheck and 1,806 core tests passed. This changes no semantic
  acceptance rule.

## Uncommitted state

The current code/evidence boundary is `116f5fa5bbad8fe26e674be4e1d55cc556d12e6a`.
Unrelated dirty files and historical diagnostic directories shown by `git
status` are preserved.
