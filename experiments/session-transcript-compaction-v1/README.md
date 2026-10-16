# Discourse compaction on a real Claude Code session transcript v1

**2026-10-16. Offline, no model calls. Not pre-registered, so this is a measurement, not a bar test. Self-reviewed.**

**Data:**
- The transcript of the Claude Code session that did this work: 4,438 JSONL events, kept private (SHA-256 `4dde33a0…1751`). Aggregates only are published, in [aggregates.json](aggregates.json).
- It is real agent traffic of the kind the owner's OpenUnum memory holds: 698 tool calls, 686 tool results, 253 assistant reports and 25 owner messages, in English and Greek, with paths, hashes, commit IDs and numbers.
- The compactor was not tuned on it.

**Method:** [`measure.mjs`](measure.mjs).
- `planDiscourseCompaction` (ADR 0021) is run with default options at 24 evenly spaced owner-turn boundaries, over the whole history up to each boundary.
- Thinking blocks are excluded.
- **Literal recall:** the share of distinct literal spellings in the history that still appear verbatim in the compacted context. Literal spellings are paths, hashes, URLs, letter-digit identifiers and multi-digit numbers, as extracted by core's `literalSpellings`.

## Result

| | Mean over 24 points | At the last point (1,489 messages) |
|---|---|---|
| Characters, compacted ÷ source | **0.649 (−35%)** | 0.662 (1.62 M → 1.07 M) |
| Literal recall, whole history | **96.4%** | 98.0% of 3,658 literals |
| Literal recall in the messages that were compacted | 95.1% | 97.4% of 2,755 |
| Semantic (`lfp:2.1`) identities used | **0** | 0 |

Unit dispositions at the last point:

| Kept | Clipped | Duplicate | Superseded | Omitted | Record |
|---|---|---|---|---|---|
| 3,802 | 343 | 522 | 87 | 1,022 | 0 |

## Reading

- **On real agent work logs, the saving comes entirely from surface handling, not from Lunum-Sem.** Keeping recent turns verbatim, clipping long units, dropping exact duplicates and superseded key/value facts, and omitting low-priority units together give about −35% characters while 96% of literals stay visible.
- **No unit received a semantic identity.** This agrees with [discourse-unit-identity-v1](../discourse-unit-identity-v1/RESULTS.md) on the owner's memory: 0 of 21,291.
- **The 2–4% of literals that are lost** are in omitted or clipped units. Which ones matter for a later question is not measured here.

## Limits

- **Characters, not tokens.** No tokenizer was called. The OpenUnum experiments report provider tokens: −52% for discourse under pressure on the owner's sessions.
- **No downstream quality check.** Literal presence is not answer quality, and no questions were asked. The [graded QA experiment](../compacted-context-graded-qa-v1/RESULTS.md) on the owner's data found the two conditions equal.
- **One session**, and an unusual one: very long, tool-heavy, and partly about Lunum itself.
