# Offline recorded-meaning diagnostic — 2026-10-02

**Scope: self-reviewed, post-hoc, diagnostic only. Zero new model calls.**
This report does not replace or edit the frozen round-two evidence. It does
not measure new extraction, generalization, retrieval or contract0.12 live
behavior. See the [target and scorer contract](../../../../experiments/meaning-scoring-recorded-v1/README.md).

## Reproduction and provenance

- Frozen implementation: `3803df6c40e5974e774df28c1d2ede5d7ccc085d`.
- Upstream baseline: `3e42fc665aa10c7c82d53f6686c5e92e602dbf7c`.
- Original live extraction: `a2909a3a048e556148e72ea10e335e65fd85d7ef`,
  contract `lunum-agent/0.10`, Claude Code, requested `sonnet`; reported models
  `claude-sonnet-5` and `claude-haiku-4-5-20251001`.
- Current offline checks: contract0.12, protocol0.4, frame0.5, fingerprint2.1.
- Source corpus SHA-256:
  `942600af5b86dd68518ede07302253f4204a29f26fa9cab12f030cbbb6ce9614`.
- Target sidecar SHA-256:
  `c2cde55bc2bf833c0c30917649b290719327c6fa0f11b12d90303e6d9e717ff9`.
- Output SHA-256:
  `7c2a2200aa10fea6d61a7e6eeb5a5ac5453f637dbdb39b55ff6a2f7ff6c873e4`.
- All 30 raw-stream hashes verified. Observed contract tool responses all
  match the frozen v11 package hash
  `cb444cab167c479f63d791a300ba51d816e06eec38ad588c7fb1e90e7280385f`.
- Original reported live cost: $5.71. New live inference cost: $0.
- Local `pnpm verify`: exit0, 4,355 tests, zero failed; includes 40 new
  scorer tests. The working tree includes preserved pre-existing user edits,
  so this is not a clean-tree publication/CI claim.

```bash
pnpm build
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v1/input-manifest.json \
  /path/to/a/new-output.json
```

`report.json` includes the bound artifacts, complete per-item candidate,
missing/extra atoms, validity stages and failure classes. The command refuses
to overwrite an existing output. It is independent of model endpoints.

## Results (not a full meaning-accuracy estimate)

| Population | All sources | Reviewed parse targets | Strict representation matches | Correct declared abstentions | Unresolved |
|---|---:|---:|---:|---:|---:|
| English | 20 | 9 | 7 | 3 | 8 |
| Greek | 10 | 3 | 2 | 1 | 6 |
| Total | 30 | 12 | 9 | 4 | 14 |

All 12 authored parse targets pass transport, structural, protocol, frame
and identity preflight. Four abstention targets have scoped self-review.
Fourteen sources have no asserted complete gold. That does not make them
correct, or remove them from the task population.

The old outcome score reproduces: **27/30**. Strict comparisons find:
- e05: nested `world`/`kind` fields make its candidate transport-invalid;
- e18 and g03: ambiguous permission-plus-negation encodings are rejected by
  current frame checks, and disagree with the prohibition targets;
- 9 of 12 reviewed parse targets strictly match their candidates.

Four correct abstentions are **declarations**, not successful null
submissions to core. The original prompt explicitly told the extractor not
to submit when abstaining. All seven recorded abstentions have
`abstentionSubmitted=false`; accepted core abstention behavior is not shown.

Micro atom recall is 243/246 (98.78%); precision is 243/248 (97.98%). These
numbers cover only 12 reviewed parse targets and must not be quoted as
overall semantic accuracy. A prohibition's single changed modality can
invalidate it despite matching almost every other atom. Invalidity and
critical per-item differences are not averaged away.

## What the audit changed

- **e02's threshold is present.** Its candidate has a below condition with
  5000 euros. The old report's dropped-threshold allegation is false. The
  precise invoice/amount scope still needs independent formal review.
- **e15 drops the failed qualifier** from the login-attempt condition.
  Lock-to-disable equivalence remains unreviewed.
- **g08 drops production scope**, broadening its prohibition. This was not
  flagged by the original report.
- **e19/g01 are modality-ambiguous.** Identity convergence with an explicit
  permission paraphrase does not establish their permission interpretation.
- Recurrence (e10), send-versus-retry and before (e11), numeric bound (g02),
  and deadline (g07) losses remain visible in the review notes; full targets
  are withheld where faithful protocol composition is unresolved.
- The original parse expectations for e09/e13 conflict with unsupported
  meaning. They are retained, not relabelled to credit observed abstentions.

An initial target draft accidentally replaced the hyphen in source
`on-call engineer` with an underscore. This was corrected before final
binding. No scorer alias or production behavior changed, and e05 remains
invalid. The original source/outputs were not edited.

## Safety and remaining work

**New deterministic core/transport discrepancy.** Replaying e05 through
current `submitCandidate` (contract0.12) reports `transportValid=true`,
`structuralValid=true`, `protocolCanonical=true`, `frameValid=true`,
`candidateIdentityAvailable=true`, `failureClass=null`. Actual JSON-Schema
validation returns false. Promotion remains false. The code path in
`packages/core/src/agent-native.ts` labels the structural validation result
as transport validity and normalizes away nested `world`/`kind` fields. The
offline scorer does not accept that shortcut.

Reproduce from the committed candidate, without gold or a provider call:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
import { submitCandidate } from './packages/core/dist/src/index.js';
const r = JSON.parse(fs.readFileSync('reports/diagnostic/2026-10-02/meaning-scoring-v1/report.json'));
const item = r.items.find(row => row.probeId === 'e05');
const result = submitCandidate({ sourceText: item.sourceText, sourceLanguage: item.language,
  candidateSem: item.candidateSem, provenance: { extractorType: 'other', timestamp: '2026-10-02T06:59:01Z' } });
console.log({ actualTransportSchemaValid: item.comparison.stages.transportValid,
  coreTransportValid: result.transportValid, identityAvailable: result.candidateIdentityAvailable,
  promoted: result.trust.promoted });
JS
```

The two deliberate in-memory scorer mutants remove modality comparison or
actor-role binding. Both then produce false matches, and the corresponding
regression assertions fail. Evidence-binding mutations and invalid gold
also fail preflight. Missing outputs contribute zero feature matches rather
than disappearing from recall denominators.

These are tests of the evaluation instrument, not proof that extraction is
safe. Source-relative targets are self-reviewed hypotheses; Greek has no
native reviewer. Strict typed/ID choices cannot adjudicate all harmless
representational variation. Historical runner limitations remain disclosed.

**Readiness: NOT READY for OpenUnum integration.** The first concrete code
repair is actual transport-schema enforcement at candidate submission,
with conformance and identity-stability tests. The evaluation blocker is
reviewed complete source meanings and explicit unsupported-case decisions
for the unresolved population. After that, freeze a fresh corpus
and code and authorize a bounded live run of the latest contract. No
OpenUnum integration, retrieval, compaction, or model-runtime work was done.
