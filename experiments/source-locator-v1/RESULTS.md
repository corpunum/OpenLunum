# Source locator v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `aef618b` before any measurement.
- **Run date:** 2026-10-08, on the owner's rig. Measured on OpenUnum at `4dbc9428`.
- **Harness:** `scripts/eval-lunum-locator.mjs`, in the OpenUnum integration branch `feat/lunum-locator`.
- **Labels:** every manual label was made by the authoring agent (Claude) and is **self-reviewed**. No second reviewer checked them.

The underlying messages are private, so this file publishes aggregates only. The raw exports, QA set and labels stay in a private cache directory (mode 700) on the rig.

## Data

- **Messages:** a read-only export of the OpenUnum store. It holds 21,032 user and assistant messages (40.9 MB of text), 6,653 facts and memory artifacts were exported alongside, and 21 secret-shaped tokens were redacted before any index or mirror was built.
- **Grounding corpus:** the live unumsearch index, read only. It has 674 units, about 206k files and 3.3 GB of text, in 9 search roots (7 single repositories and 2 split roots).

## B. Exact recall over memory (pre-registered)

The QA set has 210 items, all with at least one relevant message (seed 20261008):

- 60 hash prefixes;
- 50 ID prefixes;
- 60 path fragments;
- 40 Greek forms with a swapped suffix.

| Backend | recall@5 | recall@50 | hash @5 | id @5 | path @5 | greek @5 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fts5-prod (live query) | **0.405** | 0.486 | 0.00 | 0.98 | 0.60 | 0.00 | 0.07 | 1.2 |
| fts5-prefix (same index, `"term"*`) | **0.795** | 0.886 | 0.95 | 0.98 | 0.60 | 0.625 | 0.02 | 1.1 |
| fts5-trigram | **0.800** | 0.890 | 0.93 | 0.98 | 0.63 | 0.625 | 0.06 | 1.4 |
| unumsearch (mirror, rpc) | **0.790** | 0.881 | 0.95 | 0.98 | 0.58 | 0.625 | 0.38 | 22.7 |

Cost of each index:

| Index | Size on disk | Size against the text | Build time |
| --- | --- | --- | --- |
| fts5-porter copy | 62.9 MB | – | 0.7 s |
| fts5-trigram | 146.8 MB | **3.6×** | 4.4 s |
| unumsearch mirror plus index | 40.9 MB mirror + 24.9 MB index | – | 0.8 s |

The unumsearch rpc process used 36 MB RSS.

**Decision (Bar B):**

- The best backend (fts5-trigram, 0.800) beats fts5-prod by 39.5 points, with p95 latency of at most 50 ms, so **a fallback is worth adding**.
- unumsearch does not beat fts5-trigram by 5 points or more, so it is **not preferred for memory**.
- fts5-prefix is within 5 points of the best trigram backend (0.795 against 0.800). **The recommendation is therefore the query-side change only, with no new index.**
- fts5-trigram also fails the memory-cost line, at 3.6× the text against a limit of 3×.

### Post-hoc, not pre-registered, not used for the decision

All four backends miss the same Greek items. SQLite's `remove_diacritics` folds Latin script only, so an unaccented stem never matches accented Greek. The unumsearch case-insensitive mode does not fold diacritics either.

A variant that indexes diacritic-folded text (NFD, marks removed, lower case, final sigma) and folds the query reaches Greek recall@5 of 1.00 on every backend:

| Variant | Overall recall@5 |
| --- | --- |
| fts5-prefix-folded | 0.867 (61.8 MB extra) |
| fts5-trigram-folded | 0.871 |
| unumsearch-folded | 0.862 |

This needs re-measurement on a fresh QA set before anyone acts on it.

The remaining path misses are ranking problems: queries such as `session` or `digest` match hundreds of messages. They are not matching problems.

## A. Grounding (hallucinated or stale references)

The sample is 400 assistant messages (every 26th by id). Lookups went to the live daemon, with the `pathExists` hook switched on for absolute paths.

| Run | References | Grounded | Unverified | Out of scope | Unavailable | Unverified share of judged | p50 ms per record | p95 ms per record |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1, extractor `lunum-refs/0.1` (pre-registered) | 3,829 | 3,414 | 131 | 284 | 0 | 3.7% | 1.1 | **501** |
| post-hoc, extractor `lunum-refs/0.2` | 3,814 | 3,436 | 94 | 284 | 0 | 2.7% | 0.9 | **331** |

Unverified references by kind in v1:

| Kind | Unverified |
| --- | --- |
| path | 87 |
| file | 30 |
| identifier | 14 |
| config key | 0 |

Manual precision, from 50 distinct flagged references per run (self-reviewed):

| Run | True-unverified | Out of corpus | Extraction noise | Strict precision |
| --- | --- | --- | --- | --- |
| v1 (pre-registered) | 20 | 9 | 21 | **0.40** |
| v0.2 (post-hoc) | 23 | 17 | 10 | **0.46** |

What the labels contain:

- **True-unverified:** mostly stale references. These are deliverables or research files an agent described that no longer exist anywhere on disk. There are also a few paths that never existed: an agent read a path that failed, or claimed a deliverable that is missing. The rest are hypothetical tool names.
- **Out of corpus:** gitignored `*.log` files reached through relative `../` paths, files excluded by configuration, assets of remote websites, and inline shell or Python names.
- **v1 noise:** prose slash-lists (`build/test/deploy`), paths elided with `...`, `a/` and `b/` diff prefixes, and truncated paths. Extractor v0.2 removes most of these.

**Decision (Bar A):**

- Strict precision of 0.40 falls in the 0.30 to 0.60 band.
- p95 latency of 501 ms is above the 50 ms bar. The post-hoc run, at 0.46 and 331 ms, is in the same band.
- **Ship as diagnostic only.** `lunum_ground` ships in a separate, optional `lunum-locator-mcp` server (`integrations/source-locator`), and the OpenUnum flag stays off. The main `lunum-mcp` is left unchanged, because its bytes and `pnpm-lock.yaml` are bound by the frozen instruction package v18.

Two more notes on latency:

- Most of the latency comes from not-found lookups, which must visit every root, including two split roots with several hundred units.
- Fanning the lookups out to all roots in parallel measured about 9 times *slower* (4 min 40 s against 26 to 32 s for the run), so the adapter stays sequential with early exit.

## C. Near-duplicate candidates

The input was the discourse units of at least 80 characters from 84 long sampled assistant messages, 1,478 units in all. Blocking used trigram Jaccard of at least 0.5, different surface keys, and different messages.

| Pairs | Pairs per 1,000 units | Pairs that pass the literal gate | Precision (50 labelled) | Time |
| --- | --- | --- | --- | --- |
| 887 | 600 | 57 | **0.00** (0/50 restatements) | 1.2 s |

Every sampled pair was a templated framework line that differs only in IDs or counts, such as `Earlier chain evidence: <id>: shell_run (...)` or `Observed tool results (N successful ...)`.

The core literal gate rejected 46 of the 50. The 4 it passed were still different statements, for example the same numbers in a different order.

**Decision (Bar C):** not recommended, because precision is below 0.70. Nothing is wired. The trigram primitives stay in the package.

## Deviations

1. Post-hoc changes after the v1 results were seen:
   - extractor v0.2;
   - the Greek-folded variants;
   - the parallel-root experiment, which was reverted.

   Each is reported next to the pre-registered numbers. None of them moves a decision.
2. `out_of_scope`, meaning an absolute path outside every indexed root, and the `pathExists` hook were designed before measurement. They are part of the adapter that was measured in v1.
3. The first recall run scored unumsearch at 0 because of a harness bug: the rpc result is wrapped twice. It was fixed and re-run, and the numbers above come from the fixed run.
4. A first private unumsearch index silently merged the user's default config roots (904 MB). It was rebuilt with an empty `--config`. This is reported upstream as a usability issue.
