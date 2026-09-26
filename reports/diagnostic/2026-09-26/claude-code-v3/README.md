# Claude Code live source-only extraction, V8 package v3 (2026-09-26)

**Diagnostic development evidence, self-reviewed.** The run, the classifier fix and this analysis were done by the same agent (Claude Code session). Nobody else has reviewed them. This is not independent or protected evidence and not a training result.

## What ran

| | |
|---|---|
| Client | Claude Code 2.1.283, `claude -p`, requested `sonnet`, served `claude-sonnet-5` (all 24 rows) |
| Package | `experiments/natural-development-v8/extraction/public-instruction-package-v3.json` (sha256 `1784e3d0…`) |
| Requests | V8 `source-only-request.jsonl`, 24 rows (sha256 `5e884ba6…`), unchanged |
| Profile | V8 `public-task-profile-iteration2.json` (sha256 `cc84741c…`), unchanged |
| Code | live run at `bc337f1`; tracked tree clean at launch (checked by hand). The first run summary says `workingTreeClean: false` because it checked at the *end*, after unrelated documentation edits made during the run. No file on the extraction path changed. |
| Launcher | v3 records `launcherSha256` of the launcher at `96836bd`. The run used the `bc337f1` launcher, which differs only by dropping `--silent` from its build command. That command never ran, because the run set `LUNUM_MCP_SKIP_BUILD=1` after building once up front. The core, MCP and tool artifacts match v3's hashes. |
| Isolation | Fresh process per item in an empty temp cwd, built-in tools disabled, `--strict-mcp-config`, only `lunum_get_extraction_contract`, `lunum_build_candidate`, `lunum_submit_candidate` and `lunum_validate` allowed. The isolation is at the prompt level; it is not a technical sandbox. |
| Cost | $2.64 total over 24 items, as reported by the provider; ≈$0.08 per simple item, ≈$0.2 per conditional |

Reproduce: `node scripts/research/run-claude-code-source-only.mjs <outDir>`; then score with `node scripts/research/score-natural-source-only-extraction.mjs experiments/natural-development-v8 <outDir>/results.json ../../<outDir>/candidate-ledger.jsonl`.

## Files

- `raw/<handle>.jsonl`: complete stream-json output per item (the Sep 15 run persisted none).
- `*-initial.*`: the first classification. It counted a successful `lunum_submit_candidate` with `candidateSem: null` (core's explicit abstention) as a parse, so it reported one correct abstention as a contradictory failure. Kept for the record.
- `run-ledger.jsonl`, `candidate-ledger.jsonl`, `run-summary.json`, `results.json`: the same raw streams re-derived with the fixed classifier at `44f365f` (`--rederive`, no new model calls), scored by the unchanged frozen scorer.

## Results (`results.json`)

**Delivery (the blocker from 2026-09-15) is fixed.** 24/24 sessions connected to the MCP server, with 0 tool errors. 21/21 parse submissions were transport-, structure-, protocol- and frame-valid.

| | This run | V8 iteration 2 (2026-09-14) |
|---|---|---|
| Parse targets answered | 18/18, 0 false abstentions | 17/18, 1 false abstention |
| Source-relative match / mismatch / unresolved | 11 / 2 / 5 | 17 / 0 / 0 (1 unresolved on the false abstention) |
| Exact among legitimately comparable | 9/15 | 14/14 |
| Structural: predicate, role names, modality, negation, clause and nested-clause counts | 18/18 each (role types 17/18) | — |
| Abstention targets handled correctly | **3/6** (3 unwarranted parses) | 6/6 |
| Complete parse groups / converging | 7 / 4 | 5 / 5 |

### Failure analysis

1. **Missing-argument abstention: a safety failure, 3 rows.** "Dana allows Mira to access." and its two Greek counterparts have no object of access. All three got a parse with `theme: {"type": "access", "value": "access"}`, which is the verb recycled as its own argument. Core's submission gate called each one grounded, with identity available, because the string "access" is in the source. The model made the error and core failed to catch it. Grounding needs to reject a role filled only by the predicate's own lexical head. That is a semantic rule change and needs its own versioned decision.
2. **Unit normalization, 2 hard mismatches (g1-en-b, g2-el).** For "20%/15%" the model kept `%`; the targets use `percent`. The profile says both "preserve exactly" and, for times, `unit: times`. It never says how to render `%`. This is a contract gap rather than clear model error.
3. **Term-type vocabulary, 5 unresolved rows.** Battery `B-11` was typed `resource` (target `metric`); operator `O-11` in the bare form "to O-11"; task `U-31` in "attempts on U-31". None of these words is in the profile's `termTypePolicy`. The scorer marks all 5 contract-unresolved.

What this shows: with the tool schema fixed, this client/model reproduces the predicate/role/modality/nesting structure of every answerable V8 sentence in English and Greek. Its remaining errors are over-completion (never abstaining when an argument is missing) and vocabulary the contract leaves open. What it does not show: generalization, other models, protected data, token savings or downstream task quality.
