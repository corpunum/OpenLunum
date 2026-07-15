# claude-code integration local-model experiment

Bounded local-model smoke test for the `integrations/claude-code` work area.

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

The raw report is preserved at [`2026-07-15-claude-code-local-model.json`](./2026-07-15-claude-code-local-model.json).

| case | mode | expected | actual | pass | selected tokens | error |
| --- | --- | --- | --- | --- | ---: | --- |
| cc_tool_use | natural | YES | YES | yes | 25 |  |
| cc_tool_use | mixed | YES | YES | yes | 8 |  |
| cc_tool_use | lunum | YES | YES | yes | 8 |  |
| cc_permission_model | natural | YES | YES | yes | 31 |  |
| cc_permission_model | mixed | YES | YES | yes | 31 |  |
| cc_permission_model | lunum | YES | YES | yes | 11 |  |
| cc_terminal_capability | natural | YES | YES | yes | 22 |  |
| cc_terminal_capability | mixed | YES | YES | yes | 22 |  |
| cc_terminal_capability | lunum | YES | YES | yes | 7 |  |
| cc_context_window | natural | YES | YES | yes | 24 |  |
| cc_context_window | mixed | YES | YES | yes | 24 |  |
| cc_context_window | lunum | YES | YES | yes | 9 |  |
| cc_self_heal | natural | YES | YES | yes | 30 |  |
| cc_self_heal | mixed | YES | YES | yes | 30 |  |
| cc_self_heal | lunum | YES | YES | yes | 9 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the claude-code adoption profile (Design status).

