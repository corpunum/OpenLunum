# Pivot paraphrase v1: meaning clusters from professional translations (design)

**2026-10-16. Owner-approved direction ("ok go"). Design and a deterministic tool; no model call, no contract or identity change. Self-reviewed.**

## Why

The owner's direction: Lunum must keep **meaning, not words**. «κάλεσε / πήρε / τηλεφώνησε στην αστυνομία / πήρε το 100» can be one meaning. [ADR 0028](../../decisions/0028-language-neutral-concept-layer.md) proposes an owner-reviewed concept table, and the existing wordnet route converged on 1 of 20 EN–EL pairs because lemma lookup cannot pick a sense.

A model's memory of books cannot be the reference: recalled text cannot be checked. **Professional translations can.** Pivot paraphrasing (Bannard & Callison-Burch, 2005) uses them directly: two Greek phrases that both translate the same English phrase are candidate paraphrases, and the reverse holds for English. The evidence is countable and every link points at real aligned sentences.

## What the tool does ([`tools/pivot-miner`](../../tools/pivot-miner))

A std-only Rust program over OPUS Europarl v8 EL–EN (1,292,180 aligned pairs, already downloaded for [parallel-document-v1](../parallel-document-v1/PLAN.md); text never committed).

1. **Index.** Tokenise both sides (lower case; Greek accents and final sigma folded, so unaccented queries match), build word → line postings in memory.
2. **Translate** (`en→el` or `el→en`): find every line whose source side contains the query phrase. Count the target-side n-grams (1 to 4 words, once per line) in those lines. For the most frequent candidates, look up their frequency in the whole target side and score:
   - `p(t|q)` = lines with both / lines with the query (how often the translation uses it);
   - `p(q|t)` = lines with both / lines with the candidate (how specific it is to the query);
   - log-likelihood ratio G² against independence (how surprising the co-occurrence is).
3. **Paraphrase** (`el→en→el` or `en→el→en`): translate the query, keep the top pivots specific to it (`p(q|pivot) ≥ 0.05`), translate each back, and rank by `Σ_pivot w(pivot) · p(t2|pivot) · p(pivot|t2)` with `w ∝ p(pivot|q) · p(q|pivot)`. A ranking score, not a probability (amended 2026-10-16 after the first runs drowned in function words). The pivots are reported; fragments of the query itself are listed apart; candidates made only of very frequent words are dropped.
4. **Round trip:** for each candidate, translate it back and report the rank at which the original query returns.

Output is JSON lines: phrases, counts, scores and up to three line numbers per candidate as evidence. Line numbers point into the hashed corpus, so anyone with the same OPUS file can check them. Short phrases and counts are published; whole sentences are not.

## What it is for, and what it is not

- **For:** candidate meaning clusters, with counts, for the owner-reviewed concept table (ADR 0028), and for the model layer below.
- **Not:** an identity. Nothing it outputs changes `lfp`. Clusters are candidates until the owner accepts them, and relations (`same`, `broader`, `implies`) are decided by review, not by a score.
- **Known weaknesses:** sentence-level alignment only (no word alignment), so every n-gram in a translated sentence gets credit; frequent function words are pushed down by `p(q|t)` and G², not removed. Parliamentary language: «κάλεσε την αστυνομία» is rare in Europarl, so everyday Greek needs another corpus (OpenSubtitles or EUR-Lex summaries via OPUS, licences to be checked first).

## The model layer (next, not in this step)

Different model families propose and label; the corpus and the owner decide.
- Luna (low), SuperGemma (Ally) and, for small labelling calls only, Qwen Flash (the owner allowed it for this, sparing Halogen) label each mined cluster: same / broader / implies / different, and flag false friends and register differences.
- Agreement between families is reported. Disagreement goes to the owner.
- No model output enters the concept table without a corpus count behind it and an owner decision on the Greek.

## First measurement (planned; bars fixed before it is run)

Before any claim, a held-out check: a seeded list of EN/EL phrase pairs **not mined by the tool** (for example from the owner's 40 authored pairs, ADR 0028's examples, and EUR-Lex term lists) and the question "does the round trip put the known translation in the top 5?". That pre-registration is written after the tool works and before it is run on the list.
