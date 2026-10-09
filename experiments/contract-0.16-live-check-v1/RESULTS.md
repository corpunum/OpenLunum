# Contract 0.16 live check v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `5c9b62d`
  with the frozen requests before any provider call.
- **Run:** 2026-10-08, code commit `5c9b62d`, package v18
  (`lunum-agent/0.16`), `claude-sonnet-5` via Claude Code 2.1.295, one fresh
  process per item, concurrency 1, $0.60 requested per-item ceiling.
- **Cost:** $1.48 reported in total (part-a $0.28, part-b $0.13, part-c $1.07).
- Raw provider streams stay on the rig; ledgers, summaries and preflights are
  committed. Self-reviewed by the authoring agent (Claude).

## Parts

The runner stops remaining launches after an evidence-gate failure, as in the
v17 run, so the ten requests ran in three parts:

| Part | Rows | Evidence | Notes |
| --- | --- | --- | --- |
| part-a | e02 (`--limit 1` pilot) | valid | – |
| part-b | g02, then r1–r8 not run | **invalid** (`EVENT_OR_SOURCE_UNBOUND`) | g02 abstained; the stream had a malformed/duplicate tool-use pairing, so the runner stopped |
| part-c | r1–r8 | valid | – |

g02's abstention is reported, but its evidence is not valid under the runner's
gates.

## Outcomes

| id | outcome | candidate | identity | expected | pass |
| --- | --- | --- | --- | --- | --- |
| e02 | parse | `allow` (finance lead → Omar, approve invoices) + `below` 5000 euros condition | issued | parse, allow + below | **yes** |
| g02 | abstain (`unsupported`) | – | – | abstain | yes (evidence invalid) |
| r1 | abstain (`unsupported`) | – | – | identity, Friday | no |
| r2 | abstain (`unresolved`) | – | – | identity, tomorrow | no |
| r3 | parse | `retry`, theme nightly export job, count 3 | issued | count 3 | **yes** |
| r4 | parse | `archive` R-7, time `next week` | issued (`period:next-week` retained) | next week | **yes** |
| r5 | parse | `notify` ομάδα υποστήριξης, time `αύριο` | issued (`day:tomorrow` retained) | αύριο | **yes** |
| r6 | abstain (`unsupported`), after a null submission | – | – | count 2 | no |
| r7 | parse | `deadline` R-9, weekday `Παρασκευή` | issued (`weekday:friday` retained) | Παρασκευή | **yes** |
| r8 | parse | `notify` on-call team + `above` 20 (from "twenty") | issued | above 20 | **yes** |

## Against the bar

- **e02: pass.** The 2026-10-07 v17 run abstained on e02 because the model
  believed `allow` cannot carry a `below` condition. Under the 0.16 rule it
  submitted `allow` + `below` and core issued identity.
- **g02: pass** on outcome (abstained), but that part's evidence is invalid.
- **Relative times / number words: fail, 5 of 8 identities against a bar of
  6.** No submission dropped or resolved a relative time, or stored a different
  count: every relative time and number word that reached a candidate was
  carried (`next week`, `αύριο`, `Παρασκευή`, `three` → 3, `twenty` → 20), and
  the gate never had to refuse.

The three misses were not caused by the 0.16 rules. The model's stated reasons
point to gaps in `lunum-frame/0.5`:

- r1: `deploy` requires both `agent` and `destination`, and an imperative with
  no stated destination cannot fill them.
- r2: `rotate` requires `agent`, so an imperative has none (reason
  `unresolved`; the model gave no prose).
- r6: `restart` has no `count` role, so "δύο φορές" could not be kept.

These are correct abstentions under the current frames. They show that the
author-written probes hit frame coverage before they hit the new rules. A frame
change would be a separate, versioned decision and is not made here.

## Not established

This is a smoke check of ten author-written sentences on one model. It is not
an accuracy estimate or an independent evaluation.
