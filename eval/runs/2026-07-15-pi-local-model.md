# Pi integration local-model experiment

Bounded local-model smoke test for the `integrations/pi` work area.

Model: `qwen2.5-coder:1.5b`

Runtime:

- Node: `v22.22.2`
- Ollama: `ollama version is 0.24.0`
- Host: `http://127.0.0.1:11434`

Summary:

- Total runs: 15
- Passed: 12
- Failed: 3
- Transport/model errors: 0

The raw report is preserved at [`2026-07-15-pi-local-model.json`](./2026-07-15-pi-local-model.json).

| case | mode | expected | actual | pass | selected tokens | prompt eval | eval | error |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| pi_task_context | natural | YES | YES | yes | 20 | 41 | 2 |  |
| pi_task_context | mixed | YES | YES | yes | 20 | 41 | 2 |  |
| pi_task_context | lunum | YES | YES | yes | 9 | 41 | 2 |  |
| pi_sandbox_constraint | natural | NO | NO | yes | 24 | 58 | 2 |  |
| pi_sandbox_constraint | mixed | NO | NO | yes | 24 | 58 | 2 |  |
| pi_sandbox_constraint | lunum | NO | NO | yes | 10 | 47 | 2 |  |
| pi_user_extension | natural | YES | YES | yes | 21 | 60 | 2 |  |
| pi_user_extension | mixed | YES | YES | yes | 8 | 49 | 2 |  |
| pi_user_extension | lunum | YES | YES | yes | 8 | 49 | 2 |  |
| pi_memory_retention | natural | YES | YES | yes | 24 | 55 | 2 |  |
| pi_memory_retention | mixed | YES | YES | yes | 24 | 55 | 2 |  |
| pi_memory_retention | lunum | YES | YES | yes | 24 | 55 | 2 |  |
| pi_concurrent_tools | natural | YES | NO | no | 18 | 38 | 2 |  |
| pi_concurrent_tools | mixed | YES | NO | no | 7 | 38 | 2 |  |
| pi_concurrent_tools | lunum | YES | NO | no | 7 | 38 | 2 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the Pi adoption profile (Design status) with Pi-specific test scenarios.

