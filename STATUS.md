# Project status

**As of 2026-10-02.** This is an experimental research and reference implementation, not a qualified production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track open questions.

## What exists

**Versions:**

| Artifact | Version |
|---|---|
| Candidate schema | `lunum-sem/0.1-draft` |
| Strict identity | `lfp:2.1` |
| Protocol | `lunum-protocol/0.4`: 46 predicates, with verb aliases |
| Frames | `lunum-frame/0.5`: 37 framed predicates |
| Agent contract | `lunum-agent/0.13` |
| Frozen instruction package | v14 |

Other schema and fingerprint contracts, and migration fixtures, coexist. A file named `1.0`, or an internally frozen contract, is not external ratification.

**Core refuses identity to a candidate that:**
- violates the actual transport schema, is malformed or non-canonical;
- violates its frame, including required, dependent and distinct roles;
- fills a role with a placeholder (decisions/0007);
- uses the ambiguous `permission` + `negated` prohibition (decisions/0015);
- drops a number or identifier written in digits in its source (decisions/0016).

The rejected source text is still kept.

**Surfaces:**
- MCP server; default context mode `natural`, with `identity_dedup` opt-in;
- CLI;
- HTTP scaffold, with placeholder routes;
- in-tree OpenUnum adapter.

## What the evidence says

Historical scored MCP runs used Claude Code (`claude-sonnet-5`), one fresh process per sentence, with Lunum MCP tools only. See the [summary](reports/diagnostic/2026-09-26/EVALUATION.md). A separate [three-call Luna development pilot](experiments/luna-source-only-pilot-v1/README.md) uses the current public contract and actual builder/submission API, not MCP-only parsing. It is not protected accuracy or readiness evidence.

- **On the author's material, extraction behaves as specified:**
  - missing-argument probes 20/20, 18/18 and 16/16 in each of 3 repetitions;
  - V8 development set: 19–20 of 21 source-relative and 3/3 abstentions.
  - This is in-sample or author-written.
- **On fresh sentences from an independent session, meaning fidelity is the weak point.** [Round 2](reports/independent-evaluation/2026-09-26-round2/REPORT.md) scored **27/30 on outcome and reported 20/30 on meaning**. The manual meaning score is not settled: e02's threshold is present in the ledger, while other omissions and ambiguities were unflagged. The [offline diagnostic](reports/diagnostic/2026-10-02/meaning-scoring-v1/README.md) preserves the original evidence and expectations, with 12 valid self-reviewed parse targets, 4 abstention targets, and 14 unresolved cases. It is not a replacement overall accuracy score or a new live run.
  - The prohibition split and the dropped digit literals (2 of those 7 losses) are now mechanically blocked.
  - Dropped words, recurrences and wrong predicates are not blocked.
  - The offline scorer reproduced a core/transport discrepancy: e05 fails the actual wire schema but contract 0.12 reported transport-valid and issued identity (unpromoted). [Contract 0.13](decisions/0017-authoritative-transport-validation.md) now rejects it before normalization. Its corrected builder uses wire-shaped nested clauses. The deterministic audit withholds 48 historical identities and retains 496 unchanged; 38 of 176 frozen source-relative matches were wire-invalid. Historical outcome/match labels are not proof of full transport conformance. Contract 0.13 has only the small development pilot above, not a fresh protected qualification run.
- **Memory QA:** natural text deduplicated by identity used about 60% fewer input tokens. Sonnet kept 20/20 answers; **Haiku answered 1 question wrong in 5 of 9 runs**. The Lunum-Code renderer 0.1 loses answers. The corpus is 24 self-built sentences with paraphrase-heavy duplication, so this is not a savings estimate for real memory.
- **Identity stability:** a committed scan found no identity change from any vocabulary or frame change after it was introduced. Every loss of identity is listed in the ADRs.

Evaluation has been done by the author and by two other sessions of the same vendor and model family. There has been **no human, native-speaker or cross-vendor review**.

## What is not established

- Reliable general raw-text-to-Sem conversion across languages and domains.
- Token savings with preserved answers on real memory data.
- A validated near-semantic threshold under extraction errors.
- Production security, operations, deletion integration, or adoption by an unrelated product.
- A trained semantic compiler.

## Next, in order

1. **Complete meaning-level evaluation.** Actual wire enforcement and builder nested-clause agreement are now deterministic-tested (contract 0.13), not live-qualified. The offline role-bound scorer still has 14/30 unresolved diagnostic sources and self-reviewed targets. A [source-only diagnostic review](experiments/meaning-source-review-v1/README.md) classifies 10 as unsupported, 2 as ambiguous and 2 as source-relative representation options pending native review; it does not rewrite expectations or certify gold. The [human source-only packet](experiments/meaning-human-review-packet-v1/README.md) contains those sources with all reviews pending and no previous answers. The [runner](scripts/research/SOURCE_ONLY_RUNNER.md) now has complete v14 preflight and requested budget/timeout gates, tested without provider calls. Obtain independent/native source adjudication, freeze fresh protocol-conforming data, then measure the latest contract live under an agreed model and budget.
2. **Out-of-sample evaluation after each change**, preferably human or cross-vendor.
3. **Real memory data (owner)** before any token-saving claim.
4. **Review of unreviewed semantic judgements:**
   - the alias table (decisions/0011);
   - the extractor's mapping of use, open and enter to `access`;
   - the Greek wording: #685 is blocked on a native reviewer.

## Process

- Trunk-based on `main` ([operating model](docs/REPOSITORY_OPERATING_MODEL.md)). The earlier multi-agent process is [archived](research/archive/operating-model-multi-agent-2026-09/).
- Original code is Apache-2.0 since 2026-09-14 ([LICENSE](LICENSE), [scope](LICENSE.md)).
- No readiness percentages are maintained. The historical scorecards are [archived](research/archive/readiness-before-public-review-20260914.md) as superseded.
- OpenUnum is a separate product; the in-tree adapter is not adoption evidence.
