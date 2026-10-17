# Pro-drop replay v1 (diagnostic)

**2026-10-17. Offline, no model, cost $0. Diagnostic for [ADR 0028](../../decisions/0028-language-neutral-concept-layer.md) §6; not pre-registered, no bar, self-reviewed.**

Question: in recorded Greek Lunum records, how often does the source carry its subject **only in the verb ending** while the record has **no agent-like role** (agent, experiencer, subject, actor)?

- Verb person and number from **UniMorph Greek** (`unimorph/ell` commit `fce1186e`, CC BY-SA; not committed). Its subjunctive and future forms are stored with their particle («να καλέσω», «θα καλέσω»); [replay.mjs](replay.mjs) keeps the verb.
- Records: every valid Greek parse with an `lfp:2.1` identity in the Claude clc-v1 runs (s1e, s2e, s2e-rest, s3e, r2e, r2e-rest). The sentences are already public in the repository. Output: [result.json](result.json).

## Result

| | |
|---|---|
| Greek records with an identity | 10 |
| with a finite verb and no written pronoun | 9 |
| **of those, no agent-like role** | **3** |

The three:

| Source | Verb (UniMorph) | Record |
|---|---|---|
| «Θα καλέσω την αστυνομία.» (clc-v1 C37) | καλέσω: 1st singular | `notify`, recipient only |
| «Διαβάζω το βιβλίο σου.» | διαβάζω: 1st singular | `read`, no agent |
| «Διαβάζω το βιβλίο σας.» | διαβάζω: 1st singular | `read`, no agent |

All three are first person: the speaker is the agent, written nowhere except in «-ω». The English side of C37 kept "I". A rule "a finite verb's person is an agent" would have restored all three, and it is mechanical: the verb form decides it.

## Limits

- **10 records.** Greek coverage in clc-v1 was tiny, and Stage 0 produced 1 Greek record in 96 extractions; this is all the data there is.
- **UniMorph gaps:** «θέλω» and «σκεφτόμουν» are absent. Such verbs are invisible to the rule, so the counts are lower bounds.
- "No written pronoun" is a word list; a noun subject («Ο Τομ έδωσε…») is still counted as a candidate, though the record then correctly has an agent.
- Detection only. Whether the rule belongs in the contract, the validator or the projection is ADR 0028's open question, and any change needs ADR 0025's held-out path.
