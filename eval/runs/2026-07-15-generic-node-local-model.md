# Generic Node local-model experiment

Bounded local-model smoke test for the `integrations/generic-node` work area.

Model: `granite3.3:2b`

Runtime:

- Node: `v22.22.2`
- Ollama: `ollama version is 0.24.0`
- Host: `http://127.0.0.1:11434`

Summary:

- Total runs: 9
- Passed: 7
- Failed: 2
- Transport/model errors: 0

The raw report is preserved at [`2026-07-15-generic-node-local-model.json`](./2026-07-15-generic-node-local-model.json).

| case | mode | expected | actual | pass | selected tokens | prompt eval | eval | error |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| pref_concise | natural | YES | YES | yes | 9 | 46 | 2 |  |
| pref_concise | mixed | YES | YES | yes | 8 | 45 | 2 |  |
| pref_concise | lunum | YES | YES | yes | 8 | 45 | 2 |  |
| route_bug_fixed | natural | YES | YES | yes | 20 | 56 | 2 |  |
| route_bug_fixed | mixed | YES | NO | no | 6 | 44 | 2 |  |
| route_bug_fixed | lunum | YES | NO | no | 6 | 44 | 2 |  |
| no_delete_without_confirmation | natural | NO | NO | yes | 14 | 49 | 2 |  |
| no_delete_without_confirmation | mixed | NO | NO | yes | 14 | 49 | 2 |  |
| no_delete_without_confirmation | lunum | NO | NO | yes | 8 | 46 | 2 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.

