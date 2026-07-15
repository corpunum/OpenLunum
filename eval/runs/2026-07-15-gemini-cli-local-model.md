# gemini-cli integration local-model experiment

Bounded local-model smoke test for the `integrations/gemini-cli` work area.

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

The raw report is preserved at [`2026-07-15-gemini-cli-local-model.json`](./2026-07-15-gemini-cli-local-model.json).

| case | mode | expected | actual | pass | selected tokens | error |
| --- | --- | --- | --- | --- | ---: | --- |
| gcli_google_kg | natural | YES | YES | yes | 25 |  |
| gcli_google_kg | mixed | YES | YES | yes | 25 |  |
| gcli_google_kg | lunum | YES | YES | yes | 9 |  |
| gcli_project_context | natural | YES | YES | yes | 26 |  |
| gcli_project_context | mixed | YES | YES | yes | 10 |  |
| gcli_project_context | lunum | YES | YES | yes | 10 |  |
| gcli_code_search | natural | YES | YES | yes | 25 |  |
| gcli_code_search | mixed | YES | YES | yes | 9 |  |
| gcli_code_search | lunum | YES | YES | yes | 9 |  |
| gcli_multimodal | natural | YES | YES | yes | 20 |  |
| gcli_multimodal | mixed | YES | YES | yes | 20 |  |
| gcli_multimodal | lunum | YES | YES | yes | 7 |  |
| gcli_gcloud | natural | YES | YES | yes | 21 |  |
| gcli_gcloud | mixed | YES | YES | yes | 21 |  |
| gcli_gcloud | lunum | YES | NO | no | 9 |  |

Notes:

- `natural` uses the original message text.
- `mixed` uses the current eligibility gate.
- `lunum` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the gemini-cli adoption profile (Design status).

