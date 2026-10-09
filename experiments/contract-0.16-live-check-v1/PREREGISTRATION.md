# Contract 0.16 live check v1: pre-registered bar

Written 2026-10-08, before any provider call, and committed with the frozen
requests before the run. The bar does not move after results are seen.

## Question

Contract `lunum-agent/0.16` (ADR 0020, instruction package v18) added three
rules that have had **no live run**:

- English/Greek cardinal number words are numbers (`three times` = 3);
- relative times (`by Friday`, `tomorrow`, `next week`, `αύριο`,
  `την Παρασκευή`) are literals a candidate must carry, never drop or resolve;
- a strict threshold restricting a role is a `below`/`above` condition
  (e02); inclusive bounds (g02, `έως`) abstain.

Does a live model follow them when extracting through the served MCP tools?

## Requests (frozen: [requests.jsonl](requests.jsonl))

Ten source-only rows, `contractHash` = v18 `coreContractHash`:

| id | lang | source | expected |
| --- | --- | --- | --- |
| e02 | en | round-2 e02, unchanged | parse: `allow` + `below` 5000 condition; identity issued |
| g02 | el | round-2 g02, unchanged | abstain (inclusive bound, by design under 0.16) |
| r1 | en | Deploy the billing patch by Friday. | identity, Friday carried |
| r2 | en | Rotate the database credentials tomorrow. | identity, tomorrow carried |
| r3 | en | Retry the nightly export job three times. | identity, count 3 |
| r4 | en | Archive report R-7 next week. | identity, next week carried |
| r5 | el | Ενημέρωσε την ομάδα υποστήριξης αύριο. | identity, αύριο carried |
| r6 | el | Επανεκκίνησε τον διακομιστή S-12 δύο φορές. | identity, count 2 |
| r7 | el | Η αναφορά R-9 λήγει την Παρασκευή. | identity, Παρασκευή carried |
| r8 | en | Notify the on-call team if the error count goes above twenty. | identity, `above` 20 condition |

r1–r8 are new, author-written by the agent (Claude), not protected or
independent data; they are a smoke check of rule-following, not an accuracy
estimate. `handle-map.json` maps handles to ids and is not shown to the model.

## Run

`scripts/research/run-claude-code-source-only.mjs` with
`experiments/natural-development-v8/extraction/public-instruction-package-v18.json`,
model `claude-sonnet-5` (the model of the v17 live run, for comparability),
one-item pilot first (`--limit 1`), then the rest. Requested ceilings: $0.60
per item, $6.00 total. Raw streams stay on the rig; ledgers and summaries are
committed.

## Bar

- **e02 passes** if the model submits `allow` with a `below` 5000 condition and
  core issues an identity.
- **g02 passes** if the model abstains (or submits and core refuses).
- **Relative-time / number-word rules pass** if at least **6 of 8** of r1–r8
  receive an identity, and **0** submitted candidates resolve a relative time to
  a calendar date or store a different count (any such submission must be
  refused by core; a refusal is reported as a model failure, a gate success).

Every outcome, abstention, refusal, tool error and cost is reported.
