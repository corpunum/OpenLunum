# OpenLunum

**An experimental toolkit that lets an AI agent write down what a sentence means as a structured, checkable record, and gives that meaning a stable identity.**

It is Apache-2.0 ([LICENSE](LICENSE), [scope and third-party terms](LICENSE.md)) and pre-1.0: a research repository, not a production dependency.

OpenLunum develops **Lunum**, an intermediate representation for agent memory and context. The agent reads source text and proposes a structured meaning, a *Lunum-Sem* record. Core code then decides whether that proposal deserves an identity:

```text
source text ──► agent proposes Sem ──► core: schema, frames, placeholders, literal retention
                                          │
                     rejected ◄───────────┴───────────► accepted
            (keep natural text; no identity)            versioned identity  lfp:2.1:…
                                                        (same meaning in EN / EL → same identity)
```

Where identities hold, they allow two things:
- **deduplicating memory** across paraphrases and languages;
- **comparing claims** exactly, without a model.

The source text is always kept. When the agent can't represent a sentence faithfully, the right answer is to **abstain**, not to guess.

## A concrete example

"The finance lead allows Omar to approve invoices under 5,000 euros."

| Agent proposal | Core decision |
|---|---|
| `allow(agent: finance_lead, recipient: omar, action: approve, theme: invoices)` with condition `below(invoices, 5000 euro)` | identity `lfp:2.1:…` |
| the same, **without** the threshold condition | **no identity**: `unretained_source_literal: … 5000` |
| for "Omar *may* approve invoices under 5,000 euros" (no permitter stated): `allow(recipient: omar, action: approve, …)` | **no identity**: `frame_noncanonical` ("Predicate 'allow' requires role 'agent'"). The canonical form is `approve(agent: omar, theme: invoices)` with modality `permission` and the same condition, which gets an identity. |

Core cannot tell whether a proposal is *right*. It can refuse proposals that are malformed, that fill roles with placeholders, that are ambiguous by construction, or that drop a number or identifier stated in the source.

## Current status, in one screen (2026-10-17)

**Works and is tested** (4,532 tests; `pnpm verify`):
- **Record handling:** Sem types, canonicalization, validation against 46 predicate frames (of 55 registered predicates; protocol 0.6, frames 0.8, contract 0.19), and versioned `lfp:2.1` fingerprints. A Rust crate, `crates/lunum-sem`, reproduces `lfp:2.1` exactly and is checked against the same 7,089-entry golden file as the TypeScript build. Keys named `__proto__`, `constructor` or `prototype` are rejected at every depth.
- **Refusal gates:** core withholds identity from a candidate that:
  - is malformed;
  - uses placeholders;
  - is ambiguous by construction;
  - drops a number, identifier, date or relative time stated in the source;
  - (for general frames) uses words that are not in the source.
- **Agent tools:** an MCP server for Claude Code (`.mcp.json`). It provides the extraction contract, candidate builder, submission, context compilation and discourse records.
- **Evidence handling:** frozen instruction packages bind the build. Experiments since October are pre-registered, and failures are published.

**Measured.** Every result below is self-reviewed or reviewed by the same model family:

| What | Result | Caveat |
|---|---|---|
| Author-written sentences (V8 development set, probes v1–v3) | 19–20/21 on V8; probes 20/20, 18/18, 16/16 | In-sample: the contract was tuned on them |
| An independent session's fresh sentences ([round 2](reports/independent-evaluation/2026-09-26-round2/REPORT.md)), scored against the owner's native-checked readings ([targets](experiments/meaning-targets-owner-v1/README.md)) | **16/30 on meaning; Greek 3/10** | 10 of the parses the evaluator counted as correct drop an expiry, recurrence, exception or deadline, or pick one reading of an ambiguous "can" |
| The same 30 sentences re-run on a later contract ([v17 report](reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md)) | 16/30 on meaning; Greek 4/10 | More correct abstentions, but more mismatches |
| **The same sentence, same model, two runs** ([v17](reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md); [clc-v1](experiments/cross-language-convergence-v1/RESULTS.md)) | **the same identity in 7/12, then 4/12** | Labels and forms the source does not determine. A candidate canonical projection raises it to 11/12 and 8/12, in-sample ([ADR 0027, proposed](decisions/0027-identity-projection-candidate.md)) |
| **English sentence and its human Greek translation** ([clc-v1](experiments/cross-language-convergence-v1/RESULTS.md); 80 human EN/EL pairs plus Greek paraphrases; $41 live) | **0 of 5** pairs with an identity on both sides matched; coverage is English about 30%, Greek 5–8% | Open terms stay in their source language, so the identities cannot match. Too few pairs to evaluate under the pre-registered bar; every observed pair diverged |
| **Real agent memory** ([discourse-unit-identity-v1](experiments/discourse-unit-identity-v1/RESULTS.md), 21,291 units of the owner's OpenUnum sessions) | **0 identities**; at most about 3% of tokens could ever be deduplicated | Work logs, status lines and multi-clause instructions do not fit the frames |
| Exact recall over that memory ([source-locator-v1](experiments/source-locator-v1/RESULTS.md), [greek-fold-recall-v1](experiments/greek-fold-recall-v1/RESULTS.md)) | overall recall@5 rose from 0.41 to 0.80; unaccented Greek queries from 0.28 to 0.99 (composite 0.88) | This comes from search changes, not Lunum-Sem. It is the clearest win so far. |
| Compressed views of real context ([ambient v1](experiments/ambient-discourse-v1/RESULTS.md), [v2](experiments/ambient-discourse-v2/RESULTS.md)) | **both failed** their pre-registered bars | Not shipped |
| Discourse compaction on a real Claude Code work log ([session-transcript-compaction-v1](experiments/session-transcript-compaction-v1/README.md), 1,662 messages) | −35% characters, 96% of literals kept | Surface records only; 0 semantic identities used; no QA check |
| Memory QA on a self-built paraphrase corpus | about −60% tokens with identity deduplication; Haiku wrong in 5 of 9 runs | It does not carry over to real memory (see above) |

**Current policy:**
- **The extraction contract is frozen at 0.19** until held-out evidence exists ([ADR 0025](decisions/0025-contract-freeze-pending-held-out-evidence.md)).
- **Under review:** a narrower working scope ([ADR 0026, proposed](decisions/0026-working-scope-checkable-memory.md)): a checkable memory layer that offers exact literal retention, verified recall and refusal, with semantic identity only where convergence has been measured.
- **Reviews in progress:**
  - a cross-vendor review ([packet](experiments/cross-vendor-review-v1/README.md));
  - the owner's native-Greek review ([worksheet](experiments/owner-greek-review-v1/README.md));
  - the latest same-family review ([Fable, 2026-10-16](reports/independent-evaluation/2026-10-16-fable-review/REPORT.md)).

**Not established:**
- general text-to-meaning extraction;
- identity that converges across languages: 0 of 5 observed pairs matched, and paraphrase convergence is untested at scale;
- token savings on real memory;
- any human or cross-vendor review. Both are now being set up.

`lfp:2.1` depends on Unicode 17.0 casefold/NFKC, so Node is pinned in `.nvmrc` (22.22.2); a Unicode bump is a deliberate, reviewed change ([contract](docs/SEMANTIC_CONTRACT.md)).

Details are in [STATUS.md](STATUS.md). The working plan for the next session is in [HANDOFF.md](HANDOFF.md).

## Try it

You need Node.js 22+ and pnpm 10.13.1. No model or API key is needed for the first two steps.

```bash
git clone https://github.com/corpunum/OpenLunum.git && cd OpenLunum
corepack enable && pnpm install --frozen-lockfile
pnpm demo:core     # validate, fingerprint, contrast a negation, render: no model involved
pnpm verify        # typecheck, all tests, smoke evaluation
```

The demo supplies its own Sem. It shows the checking and identity machinery, not language understanding.

**With an agent:** open the repository in Claude Code. `.mcp.json` starts the Lunum MCP server through `scripts/lunum-mcp-launch.mjs`, which installs and builds on first use. Then ask the agent to call:
1. `lunum_get_extraction_contract`;
2. `lunum_build_candidate`;
3. `lunum_submit_candidate` on a sentence.

See [packages/mcp/README.md](packages/mcp/README.md).

## Reproduce the evaluations

The live scripts spend model credits; each report lists its cost. Everything under `reports/` keeps raw streams, ledgers and the exact package it was bound to.

```bash
# Live extraction: one fresh `claude -p` per sentence, Lunum MCP tools only
node scripts/research/run-claude-code-source-only.mjs <outDir> \
  --package experiments/natural-development-v8/extraction/public-instruction-package-v13.json \
  --profile experiments/natural-development-v8/extraction/public-task-profile-iteration6.json \
  [--requests experiments/probes-v4/requests.jsonl]

# Score (no model calls)
node scripts/research/score-natural-source-only-extraction.mjs experiments/natural-development-v8/frame-0.2-successor <outDir>/results.json <ledger>
node scripts/research/score-probe-outcomes.mjs <private-expectations.jsonl> <outDir>/run-ledger.jsonl

# Memory QA benchmark on an extraction ledger
node scripts/research/consumer-memory-qa.mjs <outDir> --ledger <candidate-ledger.jsonl> --reps 3

# Meaning-loss audit of the literal gate on recorded runs (no model calls)
node scripts/research/literal-retention-audit.mjs
```

## Repository map

| Path | What it is |
|---|---|
| `packages/core` | Sem types, protocol and frame registries, validation, fingerprints, rendering, context compilation, the extraction contract. No model or product imports. |
| `crates/lunum-sem` | Rust reproduction of the `lfp:2.1` fingerprint, byte for byte against `semanticFingerprint`; parity test over `eval-results/golden-vectors/lfp21-golden.json`. Standalone crate, not a workspace member. |
| `packages/mcp` | MCP server exposing core to agents |
| `packages/cli`, `packages/eval` | Command line; conformance and experiment tooling |
| `packages/api` | HTTP reference scaffold; several routes are placeholders ([warning](packages/api/README.md)) |
| `packages/adapter-openunum` | In-tree compatibility adapter; not a deployed integration |
| `decisions/` | Numbered design decisions (ADRs), each with its costs and limits |
| `experiments/` | Frozen inputs: V8 development set, probe sets, instruction packages, QA questions |
| `reports/diagnostic/`, `reports/independent-evaluation/` | Run records and third-party-session audits, corrections included |
| `research/archive/` | Superseded material, kept rather than deleted |

## How the project works

- **Trunk-based on `main`.** `pnpm verify` must pass before every push; CI re-runs after the push ([operating model](docs/REPOSITORY_OPERATING_MODEL.md)).
- **Evidence rules** ([AGENTS.md](AGENTS.md)):
  - frozen evidence is never edited, only superseded;
  - failures, abstentions and costs are published with results;
  - self-reviewed work is labelled as such.
- **Identity changes** (fingerprint or canonicalization) need a new version, golden vectors and migration notes.
- **Contributing:** open an issue; see [CONTRIBUTING.md](CONTRIBUTING.md) and [START_HERE.md](START_HERE.md).

**What would move the project forward most:**
- real memory data;
- meaning-level scoring (target meanings for probe sets);
- review by someone who is neither the author nor the same model family;
- a native-speaker check of the Greek.

The long-term aim, meaning that survives across languages at lower context cost, is described in [VISION.md](VISION.md). It is a goal, not a result.
