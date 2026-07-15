# openclaw integration local-model experiment

Bounded local-model smoke test for the `integrations/openclaw` work area.

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

The raw report is preserved at [`2026-07-15-openclaw-local-model.json`](./2026-07-15-openclaw-local-model.json).

| case | mode | expected | actual | pass | selected tokens | error |
| --- | --- | --- | --- | --- | ---: | --- |
| oc_plugin_arch | natural | YES | YES | yes | 26 |  |
| oc_plugin_arch | mixed | YES | YES | yes | 26 |  |
| oc_plugin_arch | lunum | YES | YES | yes | 8 |  |
| oc_config_schema | natural | YES | YES | yes | 23 |  |
| oc_config_schema | mixed | YES | YES | yes | 23 |  |
| oc_config_schema | lunum | YES | YES | yes | 10 |  |
| oc_event_bus | natural | YES | YES | yes | 27 |  |
| oc_event_bus | mixed | YES | YES | yes | 10 |  |
| oc_event_bus | lunum | YES | YES | yes | 10 |  |
| oc_sandbox | natural | YES | YES | yes | 27 |  |
| oc_sandbox | mixed | YES | YES | yes | 27 |  |
| oc_sandbox | lunum | YES | YES | yes | 8 |  |
| oc_hot_reload | natural | YES | YES | yes | 25 |  |
| oc_hot_reload | mixed | YES | YES | yes | 25 |  |
| oc_hot_reload | lunum | YES | YES | yes | 8 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the openclaw adoption profile (Design status).

