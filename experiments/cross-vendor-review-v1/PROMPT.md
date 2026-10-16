# Review request (paste this as the first message, then attach the bundle)

You are reviewing OpenLunum, an open-source research repository (https://github.com/corpunum/OpenLunum). Every line of its code, every evaluation and every earlier review was written by Anthropic Claude models. You are a different model family, chosen precisely so that you will **not** share their blind spots. The owner wants a harsh, honest review; flattery is useless to them.

Attached is `bundle.md`, built from the repository at a stated commit: the vision, status, decisions, evaluation reports, the previous (Claude) review and the core source of the extraction/identity path.

Please do the following, citing file paths from the bundle for every claim:

1. **Check the evidence, not the prose.** Pick at least five numerical claims in README/STATUS/the reports and check them against the underlying tables/ledgers in the bundle. Report each as confirmed / not confirmed / not checkable.
2. **Look for what the Claude reviews missed.** The previous review is included; do not just restate it. Where do you disagree with it? What did all the Claude-authored material assume without testing?
3. **Judge the core idea.** Lunum claims that an agent can turn text into a structured record whose identity is the same for the same meaning across paraphrases and languages. Given the evidence (including `discourse-unit-identity-v1`: 0 identities on 21,291 real units, and the v17 report: the same sentence extracted twice gets the same identity in 7 of 12 cases), is this idea worth continuing, narrowing or abandoning? Argue it.
4. **Check the design of `fingerprint.ts`, `agent-native.ts`, `literal-retention.ts` and `source-bound.ts`.** Any correctness bugs, any way to get an identity for a candidate that drops or changes meaning, any identity instability?
5. **Recommend** the next 3 experiments with pass/fail bars, and the 3 things to stop.

Format: sections 1–5 as above; then a one-paragraph verdict; then a list "claims I could not verify". Say which model and version you are.
