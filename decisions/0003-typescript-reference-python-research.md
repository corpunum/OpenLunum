# ADR 0003: TypeScript reference implementation and Python research tools

Status: accepted

The product-facing reference SDK, CLI, evaluation orchestration, and adapters use strict TypeScript and publish ESM JavaScript plus declarations. JSON Schema and conformance vectors remain language-neutral protocol authority. Python is permitted for model, tokenizer, corpus, statistics, and fine-tuning research, but Python-only behavior cannot redefine the protocol without shared vectors.

This gives Node products such as OpenUnum a native dependency while making semantic contracts explicit for agents and reviewers.
