# Local model workers

OpenLunum supports local, OpenAI-compatible chat servers so experiments can run without per-call API cost. The runner does not assume a specific model family.

## Configure

Copy `profiles/models/local-openai-compatible.example.json` and set the local endpoint and model identifier. API keys are optional and referenced through an environment-variable name, never stored in the profile.

```bash
pnpm model:doctor -- --profile profiles/models/my-model.json
```

The doctor checks `/models`, records the returned model identity when available, and performs no paid network call unless the profile points to one.

## Appropriate work for small models

- Generate parse or realization candidates.
- Explore prompt/profile variants.
- Run deterministic tests and summarize failures.
- Propose controlled-vocabulary additions.
- Create branches, reports, and PRs.

## Work requiring orchestration

- Decide whether two meanings are truly equivalent.
- Approve schema/fingerprint migration.
- Modify protected gold data.
- Declare language/model support.
- Merge safety-policy or production-serving changes.

Use low temperatures and fixed seeds where supported. Record quantization, context size, server build, prompt template, and hardware when known. Different quantizations or chat templates are different evaluation environments.
