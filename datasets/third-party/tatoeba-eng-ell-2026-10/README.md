# Tatoeba English–Greek sentence pairs (ManyThings export), 2026-10

| | |
|---|---|
| File | `ell.txt`: 17,599 rows of tab-separated `English`, `Greek`, `attribution` |
| SHA-256 | `bffd30edb72f77829cc38106cf3bdacc8bc56311dd6f2f95d482da5720ae8ac9` |
| Source | Tatoeba Project (tatoeba.org), via the ManyThings.org bilingual export (https://www.manythings.org/anki/) |
| Licence | **CC BY 2.0 FR** (https://creativecommons.org/licenses/by/2.0/fr/). Each row's third column credits both sentences, with Tatoeba sentence IDs and contributor usernames. Keep that column with any reuse. |
| Supplied by | The project owner, 2026-10-16. The file is unchanged. |
| Authorship | Written and translated by human Tatoeba volunteers. It was **not** written by the model under test. Individual contributors may have used tools; that is not verified. |

## Shape

- 11,266 distinct English sentences. **3,728 of them have two or more different Greek translations**, which gives Greek–Greek paraphrase groups made by independent human translators.
- Short, everyday sentences: first-person statements, questions and commands. Very few are operational rules of the kind the Lunum frames were built for.

## Use in this repository

- [cross-language-convergence-v1](../../../experiments/cross-language-convergence-v1/PREREGISTRATION.md) draws a seeded sample from it.
- It is public and widely copied, so it is likely in model training data. This matters for a translation task. It matters less for testing whether a frozen contract assigns identical identities.
- It is not protected evaluation data, and not gold Sem. No rows are edited. A row judged wrong gets a note in an experiment, never a change here.
