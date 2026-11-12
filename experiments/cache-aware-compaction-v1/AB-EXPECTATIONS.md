# Prompt-cache A/B: where the prefill is before the windows open

Written 2026-11-12 10:40Z, before either A/B window (anchorAtTail, UNUM_SCHED) has run. It fixes what each change can save at most, so the A/B reports are read against a number stated in advance. Aggregates only, from the OpenUnum log, 2026-11-11 16:00Z to 2026-11-12 10:35Z (after the prompt-cap change; the last 75 minutes are on OpenUnum 30b20f0b). Scripts are private (`~/.local/share/lunum-prefill/`): `trim-facts.py`, `turnstart-facts.py`.

This is not a pre-registration of a bar. The A/B reports have no pass rule; they report B against A.

## Turn starts (114 local `foreground_initial` requests, 29% of foreground prefill)

| Class | Requests | Prefilled tokens | Share of foreground prefill | Mean per request |
|---|---|---|---|---|
| full miss (`cacheN` = 0) | 33 | 567,666 | 12.9% | 17,202 |
| static prefix only (`cacheN` ≤ 10,496) | 51 | 487,119 | 11.1% | 9,551 |
| history reused | 30 | 237,231 | 5.4% | 7,908 |

- 87 of the 114 are their session's first local request in the period: missions and workers that start a new session. A new session can reuse the static prefix at best.
- 6 system prompts and 5 tool-schema sets occur at turn starts. The usual reused length is 10,240 tokens (36 requests); 3,072 occurs 12 times.
- **Upper bound for slot selection at turn starts:** if every full miss had reused 10,240 tokens, 33 × 10,240 = 337,920 tokens would not have been prefilled: 7.7% of foreground prefill. 16 of the 33 full misses came straight after a request with the same system prompt, so a slot holding that prefix existed and was not the one chosen.
- Background kinds share the two slots with other system prompts: `brain_routing` 24, `subagent_card_summary` 20, `mail-steward` 8, `memory_extract` 4, `terminal_finalize` 1 local requests in the period.

## In-turn trims (`turn_context_reserve` with `compactedCount` > 0)

- 12 trims in the period (4 on 11-11, 8 on 11-12). The 10 joined to a local foreground request prefilled 193,150 of 4,392,459 tokens: 4.4%.
- The trigger is 70% of the 65,536-token context, counted with a character estimate plus tool schemas and an 8,192-token output reserve. Real tokens are 1.08 times the estimate at the median (p10 1.04, p90 1.16), so the estimate is not what makes the trim fire early.
- After a trim the prompt is 21k to 28k real tokens, and 11k to 22k of it is prefilled. The kept tail (16 recent messages) is re-prefilled whatever the layout, because a prefix cache reuses only what comes before the first change.
- Read: the trim is a small lever. Nothing is planned for it.

## Tool iterations on 30b20f0b (2026-11-12 09:20Z–10:28Z, anchor off, 133 requests)

- 125 of 128 are append-only, with one history miss and 915 prefilled tokens per request. The other three are the trims above.
- This window has few concurrent sessions. It is not compared with the pilot (13.1% history misses on tool iterations overnight, 4 to 7 sessions on 2 slots): the difference may be load.

## What the A/B reports should show, if the changes work

- **anchorAtTail (B):** tool iterations move from `mid_prompt` to `at_tail` divergence and their prefill per request falls. The pre-window already shows 98% append-only without the flag, so the room left may be small. That would be a result, not a failure of the report.
- **UNUM_SCHED (B):** fewer full misses at turn starts and in the middle of turns. The ceiling at turn starts is the 7.7% above.
