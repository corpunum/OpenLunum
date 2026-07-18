# OpenLunum work queue

Agents choose one area and create an experiment-specific branch. Priority is evidence quality before aggressive optimization.

## P0 — repository reliability

- [x] Strict TypeScript reference implementation.
- [x] Reproducible pnpm lockfile and CI.
- [x] Agent onboarding, experiment protocol, and local-model runner.
- [x] Add schema-to-TypeScript drift checking.
- [x] Add release provenance and signed artifacts.

## P1 — semantic contract

- [x] Define semantic identity projection: decide which annotations/provenance affect fingerprints.
- [x] Expand typed time, quantity, uncertainty, reference, and modality structures.
- [x] Add canonical conformance vectors and property tests.
- [x] Version and document fingerprint migration from 0.1.

## P1 — multilingual parsing

- [x] Establish English and Greek parse baselines on `multilingual-core-v1`.
- [x] Add Spanish and Indonesian baselines.
- [x] Build error taxonomy for entity, role, negation, condition, quantity, time, and ambiguity failures.
- [x] Add explicit abstention/clarification outputs for low-confidence parses.

## P1 — realization

- [x] Implement Lunum-Sem -> English and Greek realization experiments.
- [x] Add protected-literal and independent semantic scoring.
- [x] Add round-trip self-consistency as a secondary metric only.
- [x] Add Spanish and Indonesian after English/Greek gates are credible.

## P2 — renderers and tokenizer profiles

- [x] Measure `generic-en-pivot/0.1` with exact target tokenizers.
- [x] Implement safe, short, and tight profiles without changing semantics.
- [x] Add llama.cpp-compatible tokenizer counting.
- [x] Add full-prompt quality gates for local models.

## P2 — context and retrieval

- [x] Build category/risk/confidence policy datasets.
- [x] Measure natural vs Lunum vs mixed context downstream quality.
- [x] Add multilingual retrieval and false-equivalence tests.
- [x] Design near-semantic fingerprints separately from exact identity.

## P2 — adoption

- [x] Package and verify the OpenUnum adapter in shadow mode.
- [x] Add MCP/local service reference implementation.
- [x] Add conformance reports for hook/plugin/CLI integrations.

## P2 — agent-state protocol

- [x] Encode plans, steps, tool calls, results, constraints, evidence, and inter-agent handoffs in a validated Lunum-compatible format.

## P2 — native model protocol

- [ ] Add protocol annotations for Lunum-native model compatibility (token mappings, instruction templates, fallback profiles for non-native models).

## Claiming work

Create `experiments/<experiment-id>/CLAIM.md` with worker, area, branch, start date, and intended dataset. A claim prevents accidental duplication; it does not reserve an area indefinitely.


---

# WORK_QUEUE v2 — evidence and hardening (2026-07-17)

v1 (above) is fully landed. v2 turns implementations into evidence and reference code into adoptable infrastructure.

All v2 items implemented and merged as of 2026-07-18.

## P1 — evidence

- [x] Run parse experiments (EN/EL/ES/ID) against local models via the eval runner; publish per-language metrics reports. (PR #50)
- [x] Run realization experiments (EN/EL/ES/ID) with protected-literal scoring; publish reports. (PR #62)
- [x] Token Atlas: measure natural vs safe/short/tight renderings with exact tokenizer counts on at least 3 named local models. (PR #61)

## P1 — semantic contract hardening

- [x] Implement fingerprint migration utilities (code, not just docs): detect version, migrate records, golden vectors. (PR #66, maintainer-reviewed)
- [x] Wire conformance property tests into CI as hard gates (idempotence, key-order independence, fingerprint stability). (PR #51)

## P2 — adoption

- [x] MCP server hardening: error contracts, input validation, conformance test suite. (PR #52)
- [x] OpenUnum shadow-mode live integration test against the real product runtime. (PR #57)

## P2 — renderer

- [x] Renderer profile selection driven by Token Atlas measurements (per-model best profile). (PR #55)
