# English pivot, Greek → English, relaxed agreement (P1 / P2 / P4, second run): results

**Run 2026-10-22. Self-reviewed.** As pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md), with no amendment. Scored by [`score.mjs`](score.mjs) at the pre-registration commit `2ab73b0e` (core contract 0.19, as the extraction) → [`score.json`](score.json). Nothing was changed after scoring.

## Verdicts

| # | Measure | Result | Bar | Verdict |
|---|---|---|---|---|
| **P1** | Pivot-covered Greek (structure agreement, guards 0.2) against human-English-covered, 200 pairs | **41** against **41** = **1.00 ×** (20.5 % each) | ≥ 0.8 ×, needs ≥ 30 human-covered | **PASS** |
| **P2** | Same identity as the human English (Qwen's identity), pairs covered on both sides | **20 / 36 = 56 %**, 0 collisions | ≥ 50 % over ≥ 20, 0 collisions | **PASS, carried by memoised strings** |
| **P4** | Literals of the Greek source in the accepted record | **41 / 41** (20 with numbers, dates or names) | 100 % | **PASS** |

**The P2 check.** All 20 matches are pairs where at least one translation equals the human English string. Where neither translation did, **0 of 13** pairs reached the human identity. As pre-registered, P2's pass is read as "the pivot preserves identity when a translation reproduces the canonical English", not as evidence that different wordings converge. Records from paraphrases do share the human record's **structure** often: 31 of the 36 both-covered pairs had Qwen's record with the same structure as the human one.

The predictions were P1 about 45 % to pass, P2 about 55 % to pass and carried by memoised strings, and P4 to pass.

## What the relaxation bought

| Rule (same translations, same extractions) | Pivot-covered | × human |
|---|---|---|
| v1's rule: exact identity, guards 0.1 | 27 | 0.66 |
| Exact identity, guards 0.2 | 30 | 0.73 |
| Structure agreement, guards 0.1 | 36 | 0.88 |
| **Structure agreement, guards 0.2 (P1)** | **41** | **1.00** |
| Single translator: Qwen alone | 46 | 1.12 |
| Single translator: Luna alone | 45 | 1.10 |

- **Structure agreement** recovered 11 pairs (30 → 41). The two translators' records had the same structure but different identities on 11 of the 41 accepted pairs; 30 also had identical identities. Only 1 pair failed for differing structures.
- **Guards 0.2** removed every v1 name false positive:
  - `undeclared_name` went from 6 to 0 for Qwen and from 8 to 1 for Luna;
  - `declared_literal_not_in_translation` (possessives) went from 4 and 5 to 0.
  - The one remaining case is Q64, «Κυριακές» (Sundays), capitalised in Greek and not on the nationality/language list. It is a real false positive of the same kind (weekday and month names), not covered by 0.2.
- **Pivot coverage exceeds human coverage here partly by chance.** 5 pairs are pivot-covered but not human-covered, and 5 human-covered pairs are not pivot-covered: 3 had no identity on a translation, 1 failed a guard and 1 had differing structures. P1 compares counts, as in v1, not an overlap.
- **Single-translator coverage is above human coverage** (1.10–1.12 ×). The translators' English often extracts at least as well as Tatoeba's own English.

## Reported, not bars

| | Qwen | Luna |
|---|---|---|
| Parsed / passed guards 0.2 | 200 / 175 | 200 / 181 |
| Guard failures (0.2) | ambiguous 18, necessity_changed 3, number_not_carried 2 (Q2, Q128: "2"), possibility_changed 1, future_dropped 1 | ambiguous 14, necessity_changed 2, future_dropped 2, possibility_changed 1, undeclared_name 1 |
| Exact human-English string | 87 | 100 |
| `droppedSubject` set | 119 | 90 |
| Pivot sentence copies | 21 | 24 |

- The two translators wrote the same string on 132 of 200 pairs.
- Agreement outcome over all 200 pairs: accepted 41, guard failed 36, no identity 122, structures differ 1.
- Flag agreement between the translators (200 pairs): formality 182, addressee number 170, droppedSubject 159, gender 151, evidentiality 126, aspect 114. Aspect is again the least consistent flag.
- Human coverage under Haiku was 41 of 200 = 20.5 % (v1: 25.6 %), with 26 human sentence copies. Human requests had 67 parses and 133 abstains.
- **Exact identity under the guards 0.2 is 0.73 ×,** still below the bar. The pass depends on structure agreement.

## Run record

- **Translations** ran at commit `2ab73b0e`, prompt `pivot-translate/0.1`, guards `pivot-guards/0.2`.
  - **Qwen** (`openai/qwen3.8-flash-next-uncensored-lean`, Halogen): 200 rows, 16:11–19:19 UTC, under the rig protocol. It waited through every :00–:10 / :30–:40 window and while other Halogen requests were in flight. There were no no-reply attempts.
  - **Luna** (`gpt-6-luna`, effort low): 200 rows, 16:11–17:50 UTC, at least 20 s apart. There was one no-reply attempt, Q13 (a codex timeout with no output, logged in [`translations-luna.no-reply.jsonl`](translations-luna.no-reply.jsonl)). It was re-asked 2 minutes later and answered.
- **Extraction:** `claude-haiku-5-5`, package v25, commit `2ab73b0e` on a clean checkout, concurrency 1, all evidence valid, no re-runs.
  - Human: [`2026-10-22-pv2-human-haiku`](../../reports/independent-evaluation/2026-10-22-pv2-human-haiku/), 200 items, run during the translations as the pre-registration allows.
  - Pivot: [`2026-10-22-pv2-pivot-haiku`](../../reports/independent-evaluation/2026-10-22-pv2-pivot-haiku/), 141 distinct strings ([`requests-en-pivot.jsonl`](requests-en-pivot.jsonl), committed before extraction).
- **Cost:**
  - Haiku: $1.15 (human) + $0.82 (pivot) = **$1.97 notional** (Max plan, no API charge; pre-registered estimate $2–3).
  - Luna: 201 codex calls, about 1.05 M reported tokens for the 200 answered (mostly the CLI's cached instructions), ChatGPT quota.
  - Qwen: local, about 3 hours of wall time under the protocol.

## What this means

- **ADR 0030's inbound adapter now meets all three bars on fresh pairs**, under structure agreement and guards 0.2. The losses v1 identified were real and mostly fixable:
  - name-guard false positives;
  - dual agreement on paraphrases.
- **Identity across wordings is still not shown.** P2 holds only through memoised strings: 0 of 13 non-memoised pairs matched. Structure agreement accepts the primary translator's identity, so a Greek sentence's identity depends on Qwen's wording. That identity is stable when Qwen reproduces the canonical English, and not otherwise. It is enough for coverage, not for cross-language deduplication of paraphrases.
- **Next:**
  - add weekday and month names to the guard's exemption list (Q64), pre-registered;
  - re-measure under contract 0.21 once A3's bar 2 is settled; A3 more than doubled English coverage on its own set, mostly through I/you/we fillers, which pivot English is full of;
  - P3, the Greek round trip, needs the English writer (A2).
