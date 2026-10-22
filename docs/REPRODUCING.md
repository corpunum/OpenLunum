# Reproducing the evaluations

Live runs spend model credits or subscription usage; each result file lists its cost. Everything under `reports/` keeps the raw streams, the ledgers and the exact instruction package a run was bound to. Before any live run, read the runner's rules in [SOURCE_ONLY_RUNNER.md](../scripts/research/SOURCE_ONLY_RUNNER.md): a clean checkout, an exact model ID, an approved budget, one item at a time, and **no commits while a run is in progress**.

## No model needed

```bash
pnpm demo:core      # validate, fingerprint, contrast a negation, render (the demo supplies its own Sem)
pnpm verify         # typecheck, every test, smoke evaluation

# Rust engine (toolchain pinned in rust-toolchain.toml)
for d in crates/lunum-sem crates/lunum-store crates/lunum-render tools/pivot-miner; do (cd "$d" && cargo test --locked); done

# Meaning-loss audit of the literal gate on recorded runs
node scripts/research/literal-retention-audit.mjs
```

## The English round trip (R4), step by step

[Pre-registration](../experiments/roundtrip-en-v1/PREREGISTRATION.md) · [results](../experiments/roundtrip-en-v1/RESULTS.md)

```bash
cd experiments/roundtrip-en-v1

# 1. Extraction (live; Sonnet on the CLI subscription login, package v25)
node ../../scripts/research/run-claude-code-source-only.mjs <outDir> \
  --requests requests.jsonl \
  --package ../natural-development-v8/extraction/public-instruction-package-v25.json \
  --model claude-sonnet-5-5 --total-budget-usd 200 --item-budget-usd 1 --timeout-ms 300000

# 2. Covered records -> Rust renderer -> parity score (offline)
node score.mjs --requests requests.jsonl --runs <outDir> --emit covered.jsonl
(cd ../../crates/lunum-render && cargo run -q --release --bin lunum-render) < covered.jsonl > rust-renders.jsonl
node score.mjs --requests requests.jsonl --runs <outDir> --rust rust-renders.jsonl --out result.json

# 3. Level (b) judges (local models; see the header of judge.mjs)
node judge.mjs --score result.json --requests requests.jsonl --rust rust-renders.jsonl --judge gemma --out judgements-gemma.json
```

The recorded run is in [`reports/independent-evaluation/2026-10-17-rt1-sonnet/`](../reports/independent-evaluation/2026-10-17-rt1-sonnet/); steps 2 and 3 can be re-run on it without any extraction.

## Older harnesses

```bash
# Score a V8 development-set run (no model calls)
node scripts/research/score-natural-source-only-extraction.mjs experiments/natural-development-v8/frame-0.2-successor <outDir>/results.json <ledger>
node scripts/research/score-probe-outcomes.mjs <private-expectations.jsonl> <outDir>/run-ledger.jsonl

# Memory QA benchmark on an extraction ledger (live)
node scripts/research/consumer-memory-qa.mjs <outDir> --ledger <candidate-ledger.jsonl> --reps 3
```

Other providers: [`run-codex-source-only.mjs`](../scripts/research/run-codex-source-only.mjs) (ChatGPT login) and [`run-openai-compatible-source-only.mjs`](../scripts/research/run-openai-compatible-source-only.mjs) (any OpenAI-compatible server).
