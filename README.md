<div align="center">

# 🌙 OpenLunum

**Write down what a sentence means, once, in a small language a machine can check. Then say it again, in any language.**

[![CI](https://github.com/corpunum/OpenLunum/actions/workflows/ci.yml/badge.svg)](https://github.com/corpunum/OpenLunum/actions/workflows/ci.yml) [![rust](https://github.com/corpunum/OpenLunum/actions/workflows/rust.yml/badge.svg)](https://github.com/corpunum/OpenLunum/actions/workflows/rust.yml) [![license](https://img.shields.io/badge/license-Apache--2.0-3e63dd)](LICENSE) ![status](https://img.shields.io/badge/status-research-f5c542)

<img src="docs/media/hero.svg" alt="An English sentence, 'Tom doesn't eat red meat', becomes a Lunum record: not assert(subject = tom, action = eat, object = red meat). Core checks that the record fits its frame, that every word comes from the source and that no number, date or ID was dropped, then gives it the identity lfp:2.1:sha256:3d932b11…. The Rust engine writes it back out. Measured on 200 sentences: 49/49 Rust output equals TypeScript, 48/49 keep the meaning by a lenient judge and 33/49 by a strict one, and only 49/200 sentences get a record. Greek is the next stage." width="900">

</div>

## The story

I don't write code. I had a question: AI agents pass huge amounts of text to each other and to
themselves, as memory and context. What if they could write down **what a sentence means** once,
in a small, strict language, so that the same meaning gets the same identity, whatever the words
and whatever the human language? Then memory could be checked, deduplicated and carried from
English to Greek without trusting a model's paraphrase.

That language is **Lunum**, and AI agents built this repository through my framework
[OpenUnum](https://corpunum.com): coding agents (Claude Code, Codex, and local models in a worker
loop) wrote the code and ran the experiments, and other models (GPT Sol and Luna, local Qwen and
SuperGemma) extracted sentences and judged the results. The
rules are strict on purpose. Every experiment is **pre-registered before a model sees the data**,
results are never edited after the fact, and the failures are published next to the wins. Most of
the table below is failures. That is the point: it says exactly where the idea stands.

## The idea in 30 seconds

An agent reads a sentence and proposes a **record**: a predicate, its roles, negation, modality,
conditions. Core code (no model) then decides whether the record deserves an **identity**:

| Sentence | Agent proposes | Core decides |
|---|---|---|
| "The finance lead allows Omar to approve invoices under 5,000 euros." | `allow(agent: finance_lead, recipient: omar, action: approve, theme: invoices)` if `below(invoices, 5000 euro)` | identity `lfp:2.1:…` |
| the same | the same, **without** the 5,000 condition | **refused**: `unretained_source_literal` |
| "Omar *may* approve invoices under 5,000 euros." | `allow(recipient: omar, …)`, no permitter in the source | **refused**: `frame_noncanonical`; the right record is `approve(agent: omar, …)` with modality `permission` |

Core cannot tell whether a record is *right*. It can refuse records that are malformed, use
placeholders, are ambiguous by construction, drop a number, date or identifier, or (for general
frames) use words that are not in the source. The source text is always kept, and when the agent
cannot say a sentence faithfully, the right answer is to **abstain**.

## What works, and what doesn't (yet)

| | | Evidence |
|---|---|---|
| ✅ **Identity engine, TypeScript and Rust** | The Rust crates reproduce the TypeScript identity on **7,089 / 7,089** golden records and the renderer on **10,522 / 10,522**; on fresh live records, **49 / 49** | [`lfp21-golden.json`](eval-results/golden-vectors/lfp21-golden.json), [`render-en-golden.json`](eval-results/golden-vectors/render-en-golden.json), [R4](experiments/roundtrip-en-v1/RESULTS.md) |
| ✅ **Refusal gates** | Dropped numbers, dates, IDs, relative times; placeholders; invented words in general frames: refused, with the reason | [ADRs 0016–0024](decisions/README.md) |
| ✅ **Exact recall over real agent memory** | recall@5 **0.41 → 0.80**; unaccented Greek queries **0.283 → 0.992**. This is search work around Lunum, not Lunum records, and the clearest win so far | [source-locator-v1](experiments/source-locator-v1/RESULTS.md), [greek-fold-recall-v1](experiments/greek-fold-recall-v1/RESULTS.md) |
| 🟡 **English → Lunum → English** | Where a record exists, it mostly keeps the meaning: **48 / 49** by a lenient judge, **33 / 49** by a strict one (the two agree poorly, kappa 0.08). But only **49 / 200** sentences get a record, and the way back is a notation, not an English sentence | [R4 results](experiments/roundtrip-en-v1/RESULTS.md) |
| 🟡 **Compacting a real agent work log** | **−35%** characters with **96.4%** of literals kept, but from surface handling: 0 Lunum identities used, no question-answering check | [session-transcript-compaction-v1](experiments/session-transcript-compaction-v1/README.md) |
| 🟡 **Meaning on fresh sentences** | **16 / 30** against the owner's readings; Greek **3 / 10** | [meaning-targets-owner-v1](experiments/meaning-targets-owner-v1/README.md) |
| ❌ **Greek** | **0 / 50** Greek sentences get a record (English 9 / 50 on the same pairs): today's contract refuses Greek general frames by design. Next: Greek through an English pivot, not native Greek frames | [baseline](experiments/greek-frames-heldout-v1/RESULTS-baseline.md), [ADR 0030](decisions/0030-english-pivot-translation-adapters.md) |
| ❌ **Same meaning in English and Greek → same identity** | **0 of 5** pairs; the structure alone agrees in 3 of 5. Open words stay in their language: `police` ≠ «αστυνομία» | [clc-v1](experiments/cross-language-convergence-v1/RESULTS.md) |
| ❌ **Same sentence, two runs → same identity** | **9 / 22**; a canonical projection reached 18 / 22, short of its 90% bar | [identity gate v2](experiments/identity-heldout-v2/RESULTS.md) |
| ❌ **Identities on real agent memory** | **0** over 21,291 units of the owner's sessions: work logs and instructions do not fit the frames | [discourse-unit-identity-v1](experiments/discourse-unit-identity-v1/RESULTS.md) |
| ❌ **Compressed views of real context** | both versions failed their pre-registered bars; not shipped | [ambient v1](experiments/ambient-discourse-v1/RESULTS.md), [v2](experiments/ambient-discourse-v2/RESULTS.md) |

Every review so far is self-review or same-vendor review, labelled as such. More detail:
[STATUS.md](STATUS.md). The sentence in the picture and its Greek translation are from
[Tatoeba](https://tatoeba.org) (#3170652 by CK, #5586411 by Zeus; CC BY 2.0 FR), as used in the R4 run.

## Where it goes next

The [plan](docs/PLAN-rust-engine-language-pairs.md): **English is the pivot**
([ADR 0030](decisions/0030-english-pivot-translation-adapters.md)). Lunum and the Rust engine
deal only with English; other languages connect through a model translation at the edges.

1. **English → Lunum → English** (the critical path): the acceptance gates in Rust, a real
   English sentence on the way back (not a notation), more sentences covered, and a closed loop:
   the English we write back must be extracted to the same identity again. The first step is
   done: [why three quarters of English sentences abstain](experiments/abstention-shapes-v1/RESULTS.md)
   (37 of 200 failed on one mechanical mistake that a builder fix would remove).
2. **Greek through the pivot:** a model translates Greek into English under a strict prompt and
   reports what English drops (aspect, formality, gender, pro-drop); deterministic guards abstain
   if a number, date or name goes missing or a negation or modal changes; two translators from
   different model families must land on the same identity. The way back is the English writer,
   then a model translation that uses those flags.

Each step has pre-registered bars; the Greek measurement
([pre-registration](experiments/pivot-el-en-v1/PREREGISTRATION.md)) has not run yet.

## Try it

Node.js 22 and pnpm 10.13.1. No model or API key needed:

```bash
git clone https://github.com/corpunum/OpenLunum.git && cd OpenLunum
corepack enable && pnpm install --frozen-lockfile
pnpm demo:core     # validate, fingerprint, contrast a negation, render (the demo supplies its own record)
pnpm verify        # typecheck, every test, smoke evaluation
```

The Rust engine (toolchain pinned in `rust-toolchain.toml`), with the record from the picture:

```bash
cd crates/lunum-render
echo '{"handle":"tom","sem":{"schema":"lunum-sem/0.1-draft","world":"real","kind":"event","clauses":[{"predicate":"assert","roles":{"subject":{"type":"actor","id":"Tom"},"action":{"type":"text","value":"eat"},"object":{"type":"concept","value":"red meat"}},"negated":true}]}}' \
  | cargo run -q --bin lunum-render
# {"handle":"tom","code":"R not assert(subject=tom, object=red meat, action=eat)"}
```

**With an agent:** open the repository in Claude Code. `.mcp.json` starts the Lunum MCP server
(it builds itself on first use); ask the agent to call `lunum_get_extraction_contract`, then
`lunum_build_candidate` and `lunum_submit_candidate` on a sentence. See
[packages/mcp/README.md](packages/mcp/README.md). To re-run the evaluations:
[docs/REPRODUCING.md](docs/REPRODUCING.md).

## Honest limits

- **Pre-1.0 research, not a dependency.** The extraction contract is frozen at `lunum-agent/0.19`
  until held-out evidence justifies a change ([ADR 0025](decisions/0025-contract-freeze-pending-held-out-evidence.md)).
- **Coverage is the main limit:** 18–25% of plain English sentences get a record with Sonnet, and
  it depends strongly on the model (1, 4 and 11 of 16 English sentences for three models,
  [Stage 0](experiments/parallel-document-v1/RESULTS-stage0.md)).
- **The validator checks form, not truth.** In R4 it accepted "Tom never saw Mary" as
  `not read(agent=tom, theme=mary)`.
- **No token savings on real memory are claimed.** The working scope is a checkable memory layer;
  semantic identity is claimed only where convergence has been measured
  ([ADR 0026](decisions/0026-working-scope-checkable-memory.md)).
- Identity depends on Unicode 17.0 case folding; Node is pinned in `.nvmrc`.

## Contributions welcome

Open an [issue](https://github.com/corpunum/OpenLunum/issues) or a PR; [CONTRIBUTING.md](CONTRIBUTING.md)
is short. The most useful help right now:

- **Native Greek speakers:** check the translation prompt, the meaning flags and the Greek
  negation/modality lists of the pivot adapter ([ADR 0030](decisions/0030-english-pivot-translation-adapters.md)),
  or a few judged sentences.
- **A review from outside:** someone who is neither the author nor the same model family
  ([review packet](experiments/cross-vendor-review-v1/README.md)).
- **Rust:** the acceptance gates and the English writer in the [plan](docs/PLAN-rust-engine-language-pairs.md).
- **Real memory data** that may be published, to test identity and compaction on real text.

<details>
<summary><b>📦 What is in this repository</b></summary>

| Path | What it is |
|---|---|
| `packages/core` | Records, frames, validation, identity, rendering, the extraction contract (TypeScript reference) |
| `crates/lunum-sem`, `lunum-store`, `lunum-render` | The Rust engine: identity, an append-only record store, the renderer |
| `tools/pivot-miner` | Rust miner of phrase translations and paraphrases from aligned corpora |
| `packages/mcp`, `packages/cli`, `packages/eval` | MCP server for agents; command line; experiment and scoring tools |
| `packages/api`, `packages/adapter-openunum` | HTTP scaffold (several routes are placeholders); an in-tree OpenUnum adapter (not a deployment) |
| `decisions/` | Design decisions (ADRs) with their costs; [index](decisions/README.md) |
| `experiments/` | Pre-registrations, frozen inputs, scorers and results |
| `reports/` | Raw run records and reviews, kept as recorded |
| `docs/` | Contract, protocols and the plan; [index](docs/README.md) |
| `research/archive/` | Superseded material, kept rather than deleted; [index](research/archive/README.md) |

</details>

<details>
<summary><b>⚖️ How the project works</b></summary>

- **Trunk-based on `main`.** `pnpm verify` passes before every push; CI re-runs after it
  ([operating model](docs/REPOSITORY_OPERATING_MODEL.md)).
- **Evidence rules** ([AGENTS.md](AGENTS.md)): frozen evidence is never edited, only superseded;
  failures, abstentions and costs are published with results; self-review is labelled.
- **Identity changes** need a new version, golden vectors and migration notes.
- Apache-2.0 ([LICENSE](LICENSE), [scope and third-party terms](LICENSE.md)). The long-term aim is
  in [VISION.md](VISION.md): a goal, not a result.

</details>

---

<sub>Built by AI agents with [OpenUnum](https://corpunum.com) · sibling projects:
[UnumPingPong](https://github.com/corpunum/unumpingpong) (agents rally, a referee scores),
[UnumSearch](https://github.com/corpunum/unumsearch) (fast code search for agents) and
[unumS22linux](https://github.com/corpunum/unumS22linux) (a Galaxy S22 that boots its own Linux)</sub>
