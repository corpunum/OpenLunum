# opencode integration local-model experiment

Bounded local-model smoke test for the `integrations/opencode` work area.

Model: `openai/qwen3.6-35b-a3b`

Runtime:

- Node: `v22.22.2`
- API: `llama.cpp OpenAI-compatible`
- Host: `http://127.0.0.1:8080`

Summary:

- Total runs: 15
- Passed: 15
- Failed: 0
- Transport/model errors: 0

The raw report is preserved at [`2026-07-15-opencode-local-model.json`](./2026-07-15-opencode-local-model.json).

| case | mode | expected | actual | pass | selected tokens | error |
| --- | --- | --- | --- | --- | ---: | --- |
| ocd_project_mode | natural | YES | YES | yes | 23 |  |
| ocd_project_mode | mixed | YES | YES | yes | 23 |  |
| ocd_project_mode | lunum | YES | YES | yes | 8 |  |
| ocd_shell_integration | natural | YES | YES | yes | 23 |  |
| ocd_shell_integration | mixed | YES | YES | yes | 7 |  |
| ocd_shell_integration | lunum | YES | YES | yes | 7 |  |
| ocd_web_fetch | natural | YES | YES | yes | 27 |  |
| ocd_web_fetch | mixed | YES | YES | yes | 7 |  |
| ocd_web_fetch | lunum | YES | YES | yes | 7 |  |
| ocd_edit_suggestions | natural | YES | YES | yes | 19 |  |
| ocd_edit_suggestions | mixed | YES | YES | yes | 9 |  |
| ocd_edit_suggestions | lunum | YES | YES | yes | 9 |  |
| ocd_session_save | natural | YES | YES | yes | 22 |  |
| ocd_session_save | mixed | YES | YES | yes | 22 |  |
| ocd_session_save | lunum | YES | YES | yes | 9 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the opencode adoption profile (Design status).

