# codex-cli integration local-model experiment

Bounded local-model smoke test for the `integrations/codex-cli` work area.

Model: `openai/qwen3.6-35b-a3b`

Runtime:

- Node: `v22.22.2`
- API: `llama.cpp OpenAI-compatible`
- Host: `http://127.0.0.1:8080`

Summary:

- Total runs: 15
- Passed: 14
- Failed: 1
- Transport/model errors: 0

The raw report is preserved at [`2026-07-15-codex-cli-local-model.json`](./2026-07-15-codex-cli-local-model.json).

| case | mode | expected | actual | pass | selected tokens | error |
| --- | --- | --- | --- | --- | ---: | --- |
| ccode_codebase | natural | YES | YES | yes | 25 |  |
| ccode_codebase | mixed | YES | YES | yes | 25 |  |
| ccode_codebase | lunum | YES | THINKING | no | 7 |  |
| ccode_edit_scope | natural | YES | YES | yes | 21 |  |
| ccode_edit_scope | mixed | YES | YES | yes | 21 |  |
| ccode_edit_scope | lunum | YES | YES | yes | 8 |  |
| ccode_diff_review | natural | YES | YES | yes | 20 |  |
| ccode_diff_review | mixed | YES | YES | yes | 8 |  |
| ccode_diff_review | lunum | YES | YES | yes | 8 |  |
| ccode_batch_files | natural | YES | YES | yes | 23 |  |
| ccode_batch_files | mixed | YES | YES | yes | 9 |  |
| ccode_batch_files | lunum | YES | YES | yes | 9 |  |
| ccode_explain | natural | YES | YES | yes | 19 |  |
| ccode_explain | mixed | YES | YES | yes | 19 |  |
| ccode_explain | lunum | YES | YES | yes | 8 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the codex-cli adoption profile (Design status).

