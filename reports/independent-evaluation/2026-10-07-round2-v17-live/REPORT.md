# v17 re-run of the round-2 sentences: report

**Written 2026-10-16, offline, after the run.** The run was committed on 2026-10-07 (`d8de4dc`) with ledgers but no report. Its commit message gave conclusions that no file in the repository backed up. This report scores the run.

It is self-reviewed: the scoring was done by a Claude Code session, and the targets are agent-authored and post hoc. It is not independent evidence.

## The run (unchanged, as committed)

| | |
|---|---|
| Sentences | The 30 out-of-sample sentences from [round 2](../2026-09-26-round2/REPORT.md): 20 English, 10 Greek |
| Package | v17, contract `lunum-agent/0.15`, `claude-sonnet-5` via Claude Code 2.1.293, one item per process, serial |
| part-a | Items 1–7. It **stopped on a failed gate**: e07 ("Revoke.") abstained without calling the contract tool, so `CONTRACT_UNBOUND` fired. `evidenceValid: false`. Cost $0.95. |
| part-b | Items 8–30. `evidenceValid: true`. Cost $3.13. |
| Total cost | **$4.08** |
| Raw provider streams | **Not committed** (the commit says they are kept on the rig). The raw-stream hash checks of `score-recorded-meaning.mjs` therefore cannot run. |

Because part-a failed its own gate, items 1–7 are **not valid evidence** under the runner's rules. They are scored below for completeness and marked.

## Scoring method

[`scoring/score-v17.mjs`](scoring/score-v17.mjs) calls the same `scoreRecordedMeaning` function as the recorded-meaning manifests (v1–v8), on these inputs:
- the same targets (`experiments/meaning-scoring-recorded-v1/targets.jsonl`: 16 reviewed, 14 unresolved);
- the current core, contract 0.19.

The original round-2 run is scored the same way, so the two columns are like for like. The output is [`scoring/meaning-report.json`](scoring/meaning-report.json). There were no model calls.

## Results

| | Original run (contract 0.10) | v17 re-run (contract 0.15) |
|---|---|---|
| Outcome correct (parse with identity, or abstain, as expected) | 27/30 | **21/30** |
| Reviewed targets matched or correctly abstained | 13/16 | **9/16** |
| Exact representation matches | 9 | 6 |
| Wrong outcome or missing | 0 | 2 (e02 abstained; e07 missing) |
| Unresolved targets (not scorable) | 14 | 14 |
| Feature recall / precision on reviewed parse targets | 0.99 / 0.98 | 0.81 / 0.97 |

The commit message reported 22/30 on outcome. This scorer counts 21/30, because it also requires a recorded identity for a parse to count. The commit's "meaning 19/30 strict, 22/30 lenient" was a hand reading; it is not reproduced here and has no artifact.

**What the commit claimed and holds:**
- No v17 identity drops a digit literal, date or recurrence.
- No v17 identity uses a wrong predicate.
- The retention gate never fired, because the model abstained before submitting.

**What it did not say:**
- On the reviewed targets, v17 scores **lower** than the original run.
- It over-abstains: e02 and g02 refuse a threshold permission that has a valid representation. Of the unresolved items, e10, e11, e15 and g08, which the original run parsed, now abstain.

## The finding that matters: one sentence, two runs, two identities

Both runs used the same model on the same 30 sentences. 12 sentences received an identity in both runs under the current core. **Only 7 of 12 have the same identity.**

| Item | Source | Why the identities differ |
|---|---|---|
| e03 | Contractors must not share customer phone numbers. | `kind`: `instruction` vs `safety_constraint` |
| e08 | Archive the tickets older than 90 days. | `kind`: `command` vs `instruction` |
| e14 | Do not restart the cluster during business hours. | `kind`: `command` vs `instruction`, and modality absent vs `obligation` |
| e16 | Lena is permitted by the security team to revoke expired tokens. | the agent's term type: `entity` vs `actor` |
| g04 | Επανεκκίνησε τον διακομιστή αλληλογραφίας. | the theme as `id: mail_server` vs `value: "mail server"` |

The scorer reports e03, e08 and e16 as "mismatch" for these same reasons. In every case the meaning is the same; what differs is a label that the source sentence does not determine.

Exact identity hashes `kind`, term types and the id/value form. So identity is **not stable across runs of the same extractor on the same text**, before paraphrase or translation is even considered. Deduplication by identity (decisions/0012) merges only what one run happens to label consistently.

This is a stronger result against the convergence thesis than any paraphrase test so far. It is also cheap to address:
- leave `kind` out of the identity projection, or make it source-determined;
- collapse the term types the source cannot distinguish;
- canonicalize id/value.

Any of these is a fingerprint change: it needs a new identity version, golden vectors and migration notes (AGENTS.md). See [ADR 0025](../../../decisions/0025-contract-freeze-pending-held-out-evidence.md) for why that waits on a held-out test.

## Limits

- 30 sentences, one model and two runs: the 7/12 figure has a wide uncertainty.
- 14 of the 30 targets are unresolved, and the 16 reviewed targets are agent-authored and post hoc. The owner, a native Greek speaker, is now the Greek reviewer ([packet](../../../experiments/meaning-human-review-packet-v1/README.md)).
- Items 1–7 come from a run that failed its own evidence gate.
- The raw streams are not in the repository, so the ledgers cannot be checked against what the model actually sent.
