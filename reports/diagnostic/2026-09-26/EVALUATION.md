# Live extraction evaluation, 2026-09-26

**Diagnostic development evidence, self-reviewed.** One agent (a Claude Code session) wrote the code, ran the evaluations and wrote this summary. Nobody else has reviewed it.

Every run used the same setup:
- Client: Claude Code 2.1.283, `claude -p`, served `claude-sonnet-5`.
- One fresh process per item, in an empty working directory, with built-in tools disabled. Only the Lunum contract, build, submit and validate tools were available. Isolation is at the prompt level only.
- Code ran from a clean commit. Raw streams are persisted in each run folder.
- Scoring: V8 by the unchanged frozen scorer; probes by outcome (`scripts/research/score-probe-outcomes.mjs`).

Total model cost for all six runs: **$12.56**.

## Results

| Run | Contract / profile | V8 source-relative | V8 exact / comparable | V8 abstain | Probes v1 | Probes v2 |
|---|---|---|---|---|---|---|
| [v3](claude-code-v3/README.md) | 0.3 / it.2 | 11/18 (5 contract-unresolved) | 9/15 | 3/6 | — | — |
| [v4](claude-code-v4/README.md) | 0.4 / it.3 | **18/18** | **15/15** | 4/6 | [18/20](claude-code-probes-v1/README.md) | — |
| v5 (`claude-code-v5*`) | 0.5 / it.3 | 16/18 | 14/15 | 4/6 | 18/20 | **18/20** |

Additional facts:
- 18/18 V8 parse targets were answered in every run.
- Every parse submission in every run was transport-, frame- and reference-valid.
- On the probes, every sentence with its argument stated was parsed with identity (10/10 in each of the three probe runs).
- **In-sample and out-of-sample:** V8 is in-sample for profile iteration 3 and contracts 0.4 and 0.5. Probes v1 were out of sample for 0.4 and in-sample for 0.5. Probes v2 were frozen before their only run and are out of sample for 0.5.
- **Run-to-run variance is real.** "Dana transfers 30 EUR from bank account Q-81." was correctly refused under 0.3 and 0.4. Under 0.5 it became `send(agent: Dana, object: 30 EUR)`, silently dropping the account. With one run per configuration and six V8 abstention targets, a one-item change is not evidence of improvement or regression.

## What was fixed, with evidence

1. **Tool delivery.** `lunum_build_candidate` advertised no arguments, and the MCP server could not start in a fresh clone. Both are fixed; all runs connected with no delivery errors.
2. **Contract gaps.** Unit normalization and typing of bare identifiers by role took V8 from 11/18 to 18/18 source-relative in the v4 run. This is in-sample.
3. **Self-echo placeholders** (`theme: {type: access, value: access}` and the type-only `{type: access}`) no longer receive identity (decisions/0007). The rule has zero false positives across the 2,859 Sem objects in the repository.

## What was not fixed

- **The instruction did not change behaviour.** Contract 0.5 added "a placeholder_role rejection means abstain; do not re-type". In one V8 row the model hit two `placeholder_role` rejections and then re-typed to `{type: concept, value: access}`, which passed. Instructions do not reliably stop this model from completing a frame. Only mechanical gates do, and gates can be routed around.
- **`allow` and `prohibit` with a verb complement** ("Omar allows Priya to view.", "…prohibits user U-8 from downloading."). The model sets `theme` to the verb (`event: view`, `task: downloading`) in every run and in both probe sets. **This is a contract ambiguity, not only a model error.** The `allow` frame describes itself as "permits a recipient to perform an action or access a theme", which licenses theme = action. The V8 targets and the probes assume that theme is the object, so the sentence should be refused. Someone has to decide which it is. Two options:
  - theme is the object or resource, so a missing object means abstain, and the permitted action is not represented; or
  - add an `action` role, so "allows Priya to view" parses and "allows Priya to view report R-17" carries both.

  Either way this is a frame change: new frame registry hash, golden vectors, and a new V8 profile.
- **Lossy mapping of unsupported predicates** (transfer → send, dropping the source account). Core cannot detect it, because it cannot see which source content went unrepresented.

## Not established

Anything beyond one model on 64 short English and Greek sentences. The probe expectations and Greek wording are AI-authored and have no human review. There is no token-cost or downstream-quality measurement and no second model.

## Frame 0.2 and the consumer benchmark (added later the same day)

- **Owner decision:** `allow`/`prohibit` gained an `action` role (decisions/0008). Existing identities were verified unchanged. Three repeated runs ([frame-0.2](frame-0.2/README.md), $18.50):
  - missing-argument refusals: 8/8 and 6/6 in every repetition;
  - V8 exact: 16/16 in every repetition;
  - V8 source-relative: 18/21 in every repetition, after a **regression the change caused**: "is permitted to" is now encoded as `allow`, with the permitted party as permitter;
  - verb-only `allow` sentences are over-refused (9 of 12).
- **Renderer 0.1 loses meaning** (decisions/0009). A lossless 0.2 profile was added.
- **[Consumer benchmark](consumer-qa-v1/README.md)** ($2.27, 3 runs, 20 questions, `claude-sonnet-5`):
  - natural text deduplicated by Lunum fingerprints kept 20/20 answers with **51% fewer** tokens than the natural baseline;
  - Lunum-Code 0.2 kept 20/20 at −33%;
  - Lunum-Code 0.1 saved 60% but lost 2–4 answers per run.
  - All of the saving comes from identity-based deduplication. The paraphrase-heavy corpus inflates it, and extraction cost is not included.

## Contract 0.8 and the two-model benchmark (added later the same day)

- **Permission needs a stated permitter** (decisions/0010, frame 0.3). The old encoding was shown live through the MCP server to receive a second identity for the same meaning.
- **Verb aliases for `action`** (decisions/0011, protocol 0.3).

Three repeated runs ([contract-0.8](contract-0.8/README.md), $23.71):
- fresh probes v3: 16/16 in every repetition;
- probes v1: 20/20 and v2: 18/18 in every repetition;
- V8: abstentions 3/3, exact 16–17 of 16–17 comparable, and source-relative 19/21, in every repetition.

The remaining V8 misses are a false abstention on one "is permitted to" paraphrase and a persistent typing miss.

**Consumer benchmark on those ledgers with two answering models** ([report](consumer-qa-v1-contract-0.8/README.md), $3.08). Natural text deduplicated by identity kept 20/20 answers at −60% (Sonnet) and −62% (Haiku) tokens. Renderer 0.1 lost 2–3 answers per run for both models. `compileContext` now offers that context as mode `identity_dedup` (decisions/0012).

## Contract 0.9 and the product path (added later the same day)

- **Product path:** `compileContext` in `identity_dedup` mode, measured as a benchmark condition ([report](consumer-qa-v1-product-path/README.md), $3.65), kept 20/20 answers in all six runs at −60% (Sonnet) and −62% (Haiku) tokens. The MCP default model-facing mode is now `identity_dedup` (decisions/0013).
- **Contract 0.9:** the extractor had been treating the published alias list as exhaustive and refused "activate". The contract now says aliases are not exhaustive (decisions/0011 amendment 1). One live check ([contract-0.9](contract-0.9/README.md), $6.15, single repetition):
  - V8: 20/21 source-relative, 18/18 exact, 0 false abstentions;
  - fresh probes v4 (unlisted synonyms): 13/14, where the one miss is a probe with a valid second reading;
  - probes v3: 16/16.

## Independent evaluation and corrections (added later the same day)

A separate Claude Code session audited commit `7657cab` ([report](../../independent-evaluation/2026-09-26/REPORT.md)). It is the same vendor and model family, not a human review.

**Confirmed:**
- 4,306 tests pass;
- every contract-0.8 V8 and probe score reproduces exactly from the committed ledgers;
- the package v10 hash bindings hold;
- an independent fingerprint scan found no identity change across the 0.9 alias change.

**Corrected here:**
- **Grader:** substring matching accepted wrong numeric answers. Re-graded with strict grader v2, Haiku with identity-dedup memory answered one question wrong in 5 of 9 runs, by adding up unmerged paraphrases. The MCP default was reverted to `natural` (decisions/0013 amendment 1).
- **Narrative:** the contract-0.8 README misdescribed the remaining V8 misses; see the correction at its top.
- **Out-of-sample claims:** probes v3 are not out-of-sample for the alias table.

**Open findings:**
- **Frame coverage:** only 23 predicates have frames, so permissions with no stated permitter can't be represented for verbs like read, approve or run. The evaluator's fresh probes parsed 0/6 of those, and scored 13/24 overall against its own expectations.
- **Runtime binding:** the runner does not verify the served build against the package it records.
- **Reproducibility:** the repository-wide fingerprint-scan counts in ADRs 0007–0011 came from an uncommitted script.

## Round-2 independent evaluation (added later the same day)

A second, separate session audited `a2909a3` ([report](../../independent-evaluation/2026-09-26-round2/REPORT.md)).

**Verified as fixed:** the grader hole (the re-grade reproduces byte-for-byte), the MCP default, the refusal of mismatched builds, and the committed fingerprint scan.

**Its fresh sentences:** **27/30 on outcome, but 20/30 on meaning.** 7 of 23 parses dropped a threshold, date or recurrence, or used the wrong verb, and still got an identity. Both paraphrase pairs converged.

**Acted on in decisions/0015 and the runner:**
- the canonical prohibition encoding (`permission` + negated now fails closed);
- imperative `grant`/`revoke`/`share`;
- a contract rule to abstain rather than drop a restriction, threshold, deadline, recurrence or exception;
- a binding check that no longer passes vacuously, that binds the launcher and the profile, and that fails the run on an end-of-run or contract mismatch.

**Still open:**
- **Meaning-level scoring:** probe sets have no target meanings, so outcome scores overstate fidelity.
- The grader is still a token matcher.
- The mapping of use, open and enter to `access` is unreviewed.
- The "14" mechanism is a hypothesis, not established.

## Separate CI note

CI on `7b0c21f` (a commit that added only evidence files, pushed without running local `verify`) failed 2 eval tests. They passed in 6 local runs of a fresh clone of that commit and on the next CI run (`ea7fb5d`). The failing test names could not be recovered: the GitHub log tool truncates, and this container cannot reach the log host. The cause is unidentified; it is recorded here rather than dismissed as a flake.
