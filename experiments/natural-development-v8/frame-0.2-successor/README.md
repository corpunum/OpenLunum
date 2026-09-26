# V8 successor targets for frame `lunum-frame/0.2`

Supersedes the V8 targets for runs against frame 0.2 ([decisions/0008](../../../decisions/0008-allow-prohibit-action-role.md), owner decision 2026-09-26). The frozen V8 files one level up are unchanged.

- `extraction/*` and `certification-report.json` are byte copies of the frozen V8 inputs, except for a `supersession` block added to the certification report. The request packet, private map and contract hashes are identical, so ledgers from V8 runs can be scored against either target set.
- `certified-subset.jsonl` differs from V8 in exactly three rows: "Dana allows Mira to access." and its two Greek versions. They changed from abstain to parse, `allow(agent: Dana, recipient: Mira, action: "access")`, and now form the semantic group `allow-action-access`. The corpus is now 21 parse targets and 3 abstention targets.
- The new targets are **self-authored and unreviewed**. Before any model run, the unchanged frozen scorer was checked on a synthetic ledger: it scores the new target form as a source-relative and exact match.

Scores under these targets are in-sample for the frame decision: the decision was made after seeing these rows fail.
