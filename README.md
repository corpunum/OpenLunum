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

## Current status, in one screen (2026-09-27)

**Works and is tested** (4,315 tests; `pnpm verify`):
- **Record handling:** Sem types, canonicalization, validation against 37 predicate frames (of 46 registered predicates), and versioned `lfp:2.1` fingerprints.
- **Agent tools:** an MCP server with the extraction contract, candidate builder, submission and context compilation. It runs in Claude Code from this repository's `.mcp.json`.
- **Evidence handling:** frozen instruction packages that bind artifact hashes. The live runner refuses to run against a build that differs from the frozen package.

**Measured live** (Claude Code, `claude-sonnet-5`, one fresh process per sentence, [summary](reports/diagnostic/2026-09-26/EVALUATION.md)):

| What | Result | Caveat |
|---|---|---|
| The author's development set (V8, 24 EN/EL sentences) | 19–20/21 source-relative, 16–18 exact, abstentions 3/3 | In-sample: the contract was tuned on it |
| The author's missing-argument probes v1–v3 | 20/20, 18/18, 16/16 in each of 3 repetitions | Author-written; v3 is not out-of-sample for the alias table |
| An independent session's fresh sentences ([round 2](reports/independent-evaluation/2026-09-26-round2/REPORT.md)) | **27/30 on outcome, but 20/30 on meaning** | 7 parses dropped thresholds or dates, or used a wrong verb, and still got an identity |
| Memory QA ([benchmark](reports/diagnostic/2026-09-26/consumer-qa-v1-product-path/README.md)): natural text deduplicated by identity | about **−60% input tokens**; Sonnet 20/20 answers | Haiku answered 1 question wrong in 5 of 9 runs. The corpus is paraphrase-heavy and self-built |

**What we did about the weak spots:**
- The MCP default context mode is `natural`; `identity_dedup` is opt-in.
- The default Lunum-Code renderer (0.1) loses meaning. The lossless renderer `generic-en-pivot/0.2` exists but is not the default.
- Since round 2:
  - the prohibition encoding is canonical ([0015](decisions/0015-canonical-prohibition-and-imperative-grants.md));
  - dropped digit literals now block identity ([0016](decisions/0016-source-literal-retention-gate.md)). That gate catches 2 of the 7 meaning losses above; it has not yet been run live.

**Not established:**
- general text-to-meaning extraction;
- broad language support: only English and Greek were tested, and the Greek is AI-written;
- token savings on real memory data;
- any human or cross-vendor review. All evaluation so far is by the author or by other sessions of the same model family.

Details are in [STATUS.md](STATUS.md) and [docs/LUNUM_READINESS.md](docs/LUNUM_READINESS.md).

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
