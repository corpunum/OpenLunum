# Greek diacritic folding for exact recall v1: pre-registered bar

Written 2026-10-08, before any measurement, and committed before the results.
The bar and the method are fixed here. A method change after results are seen
goes into the results file as a deviation; the bar does not move.

## Question

OpenUnum's exact-recall fallback (`runtime.lunumMemory.exactRecall`, OpenLunum
[source-locator-v1](../source-locator-v1/RESULTS.md)) fills empty result slots
with FTS5 prefix matches. SQLite's `unicode61` tokenizer folds Greek case and
final sigma but **not** Greek accents, so an unaccented query (`αποθηκευση`) or
an uppercase source (`ΑΠΟΘΗΚΕΥΣΗ`) does not meet accented text (`αποθήκευση`).
A post-hoc test in source-locator-v1 reported ~0.87 overall recall@5 with a
diacritic-folded index. That test was built after the miss was seen and its
Greek queries were unaccented by construction, so it is **not reused**.

Does folding Greek diacritics in the exact-recall path fix this on a fresh,
held-out set of Greek literals, without regressions?

## Candidate (what would ship)

Query-side only, no new index: in the prefix fallback, each Greek term is
lower-cased and stripped of diacritics, cut to its stem, and expanded into the
OR of its accent variants — the bare folded stem plus the stem with a tonos on
each single vowel (and, where an ι/υ follows another vowel, the dialytika
forms). This matches accented, unaccented and uppercase text through the
existing `messages_fts` index. Non-Greek terms are untouched.

Reference only (not a candidate): a separate FTS5 `porter unicode61` index over
diacritic-folded text with folded queries, as in the post-hoc test.

## Data

- Fresh read-only export of `~/.openunum/openunum.db` (user and assistant
  messages), secrets redacted before indexing, private work dir (mode 700).
- **Fresh held-out QA set**, seed `20261009` (the old set used `20261008`):
  - candidates: Greek-script words of 7+ letters in real messages;
  - **excluded**: every word, and every word whose folded stem equals a folded
    stem, in the old source-locator-v1 Greek set (40 items);
  - relevance: messages whose folded text contains the folded stem; keep
    lexemes with 1 to 3 relevant messages (as before, so @5 is meaningful);
  - one lexeme per folded stem; 60 lexemes drawn.
- Each lexeme gives three queries:
  - **A, as written**: the word, lower-cased, accents kept;
  - **U, unaccented**: the same word with diacritics removed;
  - **I, inflected unaccented**: a different inflection by the fixed suffix-swap
    table of source-locator-v1, diacritics removed.
- Non-Greek control: the 170 hash/id/path items of source-locator-v1 rebuilt
  with that harness's seed over the new export.

## Measure

recall@5 and recall@50 per query class, for: live query (`fts5-prod`), shipped
fallback (live + prefix, greek stem), candidate (shipped + folding), reference
(folded index). Fallback latency p50/p95. Composite "overall" = 170 non-Greek
control items + the 60 **I** items (the same class mix as source-locator-v1),
reported for comparison with the post-hoc 0.87.

## Bar

The candidate ships (folding on whenever `exactRecall` is on) only if all hold:

1. recall@5 over U ∪ I (120 queries) is **≥ 0.85** and **≥ shipped + 0.20**;
2. recall@5 on A is **not lower** than shipped;
3. the 170 non-Greek control items return **identical** results (folding only
   touches Greek terms);
4. fallback p95 latency **≤ 10 ms** on the rig.

Otherwise the code lands behind a separate flag, default off, with the result
recorded.

## Not measured

Precision of the extra matches (a folded stem can meet a word that differs only
by accent, e.g. πότε/ποτέ). Prefix hits only fill slots left after whole-word
hits, so whole-word ranking is unchanged.

## Labels

No manual labels. Built and measured by the authoring agent (Claude); self-reviewed.
