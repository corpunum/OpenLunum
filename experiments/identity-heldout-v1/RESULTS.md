# Identity-projection held-out gate (ADR 0027): results

**2026-10-17. Not run, by the pre-registered feasibility rule. Self-reviewed. Cost $0.**

[Amendment 2](PREREGISTRATION.md) fixed, before any call on these sentences, that the two runs start only if the extractor (SuperGemma on the ROG Ally) covers at least 5 of the 16 English sentences of parallel-document Stage 0. It covered **1 of 16** ([Stage 0 results](../parallel-document-v1/RESULTS-stage0.md)). Below that rate, 120 sentences cannot give the 20 non-copy pairs the bar needs.

**Verdict: not run, extractor coverage too low.** No held-out sentence of this set has been sent to any model; the set stays unseen and usable.

ADR 0027 stays proposed. `lfp:2.1` is unchanged.

To run the gate meaningfully, an extractor needs English coverage of roughly a third or more. On Stage 0 only Sol 6.1 at medium effort reached that (11 of 16), at about 3.3M input tokens per 32 items; 240 items would be about 25M tokens of ChatGPT quota, or a paid Claude run with an owner-approved budget. Either needs a new amendment before any call.
