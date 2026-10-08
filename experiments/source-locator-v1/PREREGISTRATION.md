# Source locator v1: pre-registered decision bar

Written 2026-10-08, before any measurement was run, and committed before the results.
The bar and the method are fixed here. If the method has to change after results are seen,
the change and the reason go into the results file as a deviation, and the bar does not move.

## Question

Does an optional *source locator* (a provider that answers "does this literal occur in an indexed
corpus, and where") add value to OpenLunum discourse records and to OpenUnum memory recall?
The candidate backends are the `unumsearch` daemon (trigram plus next-byte index over the
owner's repos) and SQLite FTS5 with `tokenize='trigram'`. The baseline is what is live today,
FTS5 `porter unicode61`, queried exactly as `searchConversationText` does.

The core is not changed. The locator is an adapter package. With no locator configured,
behaviour is unchanged.

## Data

Read-only export of `~/.openunum/openunum.db` (messages, facts, memory_artifacts) into a private
temp directory (mode 700). Secret-looking tokens are redacted in every mirror before indexing.
The file corpus for grounding is the live unumsearch index, with nothing re-indexed.

## A. Grounding (hallucinated or stale reference detection)

- Sample: up to 400 assistant messages, chosen deterministically (every k-th by id).
- Extraction: repo-relative or absolute paths, file names with a known extension, code identifiers
  (camelCase, snake_case and `name()` calls of length 6 or more), dotted config keys and versions.
  Extraction is deterministic and is part of the adapter under test.
- Check: every reference is looked up with unumsearch, using a literal search for identifiers and
  keys, and a file-name search on the basename plus a literal search for paths. A reference
  counts as *grounded* if it is found anywhere in the index.
- Report: the share of references that are ungrounded, per kind.
- Precision: 50 flagged items drawn uniformly at random with a fixed seed. Each is inspected by hand
  and labelled with one of:
  - `true-unverified`: the reference is real, but it does not exist on disk anywhere, or exists
    only outside the corpus in a way that makes the claim stale or wrong;
  - `out-of-corpus`: the reference exists, but outside the indexed roots, for example `/etc`,
    `~/.config` or a remote host;
  - `extraction-noise`: not a reference at all.

  Strict precision is `true-unverified / 50`.
- **Bar A:** grounding is *recommended to the owner to enable* if strict precision is at least
  0.60 **and** the grounding latency p95 is at most 50 ms per record, using the daemon. If strict
  precision is from 0.30 to 0.60, it ships as a diagnostic-only tool: the MCP tool exists and the
  OpenUnum flag stays off. Below 0.30, it is not recommended.

## B. Exact recall over memory

QA set: literals stated in user or assistant messages, built mechanically with a fixed seed.

| Class | Items | Query |
| --- | --- | --- |
| hash | 60 | A git-like hex hash of 12 or more characters in a message. The query is its first 7 characters (a partial ID). |
| id | 50 | A UUID, session ID or similar dashed ID. The query is its first 8 or more characters, cut at a character boundary. |
| path | 60 | A path with 2 or more segments. The query is the basename without its extension when that is 6 or more characters, otherwise the last two segments. |
| greek | 40 | A Greek word of 7 or more letters whose diacritic-folded stem appears in at most 3 messages. The query is a *different* inflected form, made by a fixed suffix swap table (ος↔ου, ης↔η, ας↔α, ει↔ουν, ω↔ει, ες↔ων, ο↔ου). |

Relevant set: every message containing the full literal. For Greek, relevant means any message
containing the folded stem. A hit at 5 means a relevant message is ranked in the top 5.

Backends, all with the same query fallback rule:

1. **fts5-prod**: the exact production query, `conversationTerms` with quoted OR terms, BM25.
2. **fts5-prefix**: the same index, with each term made a prefix query (`"term"*`). For Greek the
   term is first cut to its stem; the stem rule is to drop a final suffix from the swap table and
   keep at least 5 letters. This tests whether a query-side change alone is enough.
3. **fts5-trigram**: a new FTS5 table with `tokenize='trigram remove_diacritics 1'`. The query is
   a substring match on the fragment (the Greek stem for Greek), ranked by BM25.
4. **unumsearch**: a separate index (its own `--index-dir`) over a text mirror with one file per
   message. The query is a literal case-insensitive search (the Greek stem for Greek). It is
   ranked newest message first, because it returns no score.

Report recall@5 and recall@50 (found at all) per class, query latency p50 and p95, build time,
and index size on disk.

**Bar B:**
- A memory fallback is worth adding if the best backend improves overall recall@5 by at least
  15 percentage points over fts5-prod, with p95 query latency of at most 50 ms.
- fts5-trigram is preferred for memory, because it has no dependency, no mirror and no new
  secret surface, unless unumsearch beats it on recall@5 by at least 5 points overall.
- If fts5-prefix alone gets within 5 points of the best trigram backend, the recommendation is
  the query-side change only, with no new index.
- Memory cost: an extra index of at most 3 times the message text size on disk is acceptable.

## C. Near-duplicate candidates

- Units: discourse units (core `analyzeDiscourse`) of long assistant messages from the sample,
  limited to units of 80 characters or more.
- Blocking: candidate pairs share at least 50% of their character trigrams (Jaccard on trigram
  sets), have different `lsu:0.1` keys, and come from different messages. Exact surface
  duplicates are already handled by the core, so this measures near-verbatim restatements only.
- Precision: 50 random candidate pairs (fixed seed), hand-labelled `restatement` (the same
  statement with small edits) or `different` (for example, a different number or a different
  subject).
- **Bar C:** recommended as a blocking stage if precision at Jaccard 0.5 is at least 0.70 **and**
  it finds at least 20 restatement pairs per 1,000 units. Otherwise it is not recommended. A
  candidate is never merged without the core literal gate, whichever way this goes.

## Labels

All manual labels are self-reviewed by the authoring agent (Claude) and say so.
