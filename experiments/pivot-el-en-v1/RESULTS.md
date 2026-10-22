# English pivot, Greek → English (P1 / P2 / P4): results

**Run 2026-10-22. Self-reviewed.** As pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md) with [Amendment 1](PREREGISTRATION.md#amendment-1-2026-10-22-haiku-extracts-luna-low-is-the-second-translator) (owner's cost decision: Haiku extracts, Luna at low effort is the second translator; bars unchanged) and [Amendment 2](PREREGISTRATION.md#amendment-2-2026-10-22-during-the-run-luna-rate-limits-are-not-translations) (Luna 429s are not translations). Scored by [`score.mjs`](score.mjs) at the committed version → [`score.json`](score.json). Nothing was changed after scoring.

## Verdicts

| # | Measure | Result | Bar | Verdict |
|---|---|---|---|---|
| **P1** | Pivot-covered Greek against human-English-covered (160 pairs) | **25** against **41** = **0.61 ×** (15.6% against 25.6%) | ≥ 0.8 ×, needs ≥ 30 human-covered | **FAIL** |
| **P2** | Same identity as the human English, pairs covered on both sides | **18 / 24 = 75%**, 0 collisions | ≥ 50% over ≥ 20, 0 collisions | **PASS** |
| **P4** | Literals of the Greek source in the accepted record | **25 / 25** (17 with at least one literal: names, numbers) | 100% | **PASS** |

The predictions were P1 30% likely to pass, P2 about 45%, P4 passes on few items.

## Why P1 fails

Of the 41 sentences whose human English got a record, the pivot accepted 24 (plus one, P90, that the human English missed):

| Outcome on the 41 human-covered pairs | Pairs | What happened |
|---|---|---|
| Accepted | 24 | |
| A guard failed on at least one translation | 6 | 4 are **`undeclared_name` on a nationality or language adjective** (Canadian, French: the guard treats a capitalised mid-sentence word as a name the translator must declare); 1 `necessity_changed` on both translations of "You don't need to convince me." (the guard's necessity lists disagree across the two languages here); 1 `declared_literal_not_in_translation` on both: the guard did not find the declared name "Mary" in "Tom tried to poison Mary's dog." (probably the possessive; not investigated) |
| Both passed, translations differ, **identities differ** | 5 | "deliberately / intentionally", "buys / is buying", "in the south of / south of", "gladdened / made happy", "carriages / cars" |
| Both passed, but the English got no record | 6 | the translators' wording abstained where the human wording did not ("ran out of petrol", "lost the car key", "will return home at midnight"); two are real translation differences ("more than ten" → "ten"; a proverb translated literally) |

So dual agreement and the guards cost about equally. **Single-translator coverage** was 32 for Qwen and 32 for Luna (0.78 × human, just under the bar); requiring both to land on one identity takes it to 25. Fixing the nationality/language-adjective false positive alone would have recovered at most 4 pairs (to 29 / 41 = 0.71 ×): not enough, and not applied (post-hoc).

## P2 is carried by memoisation

All 18 same-identity pairs are pairs where at least one translation reproduced the human English **string** exactly, so memoisation made the identity equal by construction. Where neither translation equalled the human string, **0 of 6** pairs reached the human identity. Each translator reproduced the human English string on 74–75 of 160 pairs, and the two translators wrote the same string on 114 of 160. Tatoeba is very likely in both models' training data; P2's pass says the pivot preserves identity when the translation is the canonical English, not that different wordings converge. The extractor still gives different identities to paraphrases.

## Reported, not bars

| | Qwen | Luna |
|---|---|---|
| Guard failures (pairs) | ambiguous 9, undeclared_name 4, necessity_changed 3, declared literal missing 1 | ambiguous 8, undeclared_name 5, necessity_changed 3, declared literal missing 2, no parse 1 (P102: the codex process hung past 300 s; recorded as failed, not re-asked) |
| Single-translator coverage | 32 | 32 |
| Exact human-English string | 74 | 75 |
| `droppedSubject` set | 89 | 63 |

- Agreement outcome over all 160: accepted 25, guard failed 26, no identity 103, identities differ 6.
- Flag agreement between the translators (159 pairs with both parsed): formality 148, addressee number 144, droppedSubject 126, gender 123, evidentiality 110, aspect 90. Aspect is the least consistent flag.
- Human-English sentence copies: 21 of 160 (questions, as in R4 and A0).
- **Human coverage under Haiku (25.6%) is close to Sonnet's on R4 (24.5%)**, so the "about 39 human-covered" expectation held (41).

## Run record

- **Translations:** Qwen (`openai/qwen3.8-flash-next-uncensored-lean`, Halogen) 160 rows, about 96 minutes of request time, under the rig protocol (one call at a time, minutes :00–:10 and :30–:40 UTC skipped, waiting while Halogen had more than one request in flight). The run stopped twice without writing a row: once on a client headers timeout (Halogen took over 300 s to answer under load) and once when the rig was rebooted for a Halogen GPU wedge (about 12:20–12:48 UTC); both times it resumed at the next untranslated pair (rows carry commits `22177b8d` and `5e6ac561`; the prompt and code were identical). Luna (`gpt-6-luna`, effort low) 160 rows plus 7 rate-limited calls set aside under Amendment 2 ([`translations-luna.rate-limited.jsonl`](translations-luna.rate-limited.jsonl)) and 1 dev smoke call; rows carry commits `22177b8d` and `c07d5869`.
- **Extraction:** `claude-haiku-5-5`, package v25, concurrency 1, all evidence valid.
  - Human: [`2026-10-22-pv1-human-haiku`](../../reports/independent-evaluation/2026-10-22-pv1-human-haiku/), 160 items, commit `5e6ac561`. This ran **before** the translations were committed (the pre-registration listed it after); it reads only the human English requests committed with the pre-registration, so the order does not touch the measurement.
  - Pivot: 106 distinct English strings. The first run ([`2026-10-22-pv1-pivot-haiku`](../../reports/independent-evaluation/2026-10-22-pv1-pivot-haiku/)) completed 4 items and stopped on the subscription's session limit (`usage_limit_reached`, an invalid row the runner never counts). The other 102 ran after the reset with Haiku, in [`2026-10-22-pv1-pivot-haiku-rest`](../../reports/independent-evaluation/2026-10-22-pv1-pivot-haiku-rest/) (its request subset is `requests-rest.jsonl` there). Both runs are at commit `0756b7d1`.
- **Cost:** Haiku $0.94 (human) + $0.03 + $0.59 (pivot) = **$1.56 notional**, Max plan, no API charge (Amendment 1 estimated $8–15). Luna: 168 codex calls, about 0.9 M tokens reported for the 160 answered (mostly the CLI's cached instructions), ChatGPT quota. Qwen: local.

## What this means for the plan

- The pivot **keeps identity and literals when it accepts** (P2, P4) but **accepts too rarely** (P1). The losses are in three places: guard false positives (nationality and language adjectives as undeclared names, "need" as necessity), dual agreement on paraphrases, and extractor abstention on the translators' wording.
- The plan's risk section already names the honest next step: a **pre-registered** relaxation (for example, a nationality/language-adjective exception in the name guard, and agreement on structure plus normalised fillers), on a fresh held-out set. Running it on these 160 pairs would be tuning on them.
- A3 (contract 0.21) changes the extractor's coverage on both sides; P1 should be re-measured after A3, on fresh pairs.
