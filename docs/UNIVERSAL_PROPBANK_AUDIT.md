# Universal PropBank 2.x audit

Audit date: 2026-09-07. This is a standards and data-use audit, not a claim
that UP data is approved training gold for OpenLunum.

## Result

The current primary UP2 release identified is **UP2.0**. The UP2.0 paper
describes high-quality automatically generated PropBanks for 23 languages
from eight language families, with manually annotated instances for three
languages. UP2 is distributed in `.conllup` form and is built from UD 2.9
and PropBank v3 conventions. The project sources describe migration from the
earlier UP1 format, but no newer numbered UP2.x release was found in the
official project sources reviewed.

UP2 is useful auxiliary evidence for predicate and argument-span learning,
but it is not a lossless Lunum target. A PropBank roleset is sense-specific,
and A0/A1 are not universal Lunum roles. Any conversion must be roleset-aware,
explicitly mapped, and allowed to return unresolved. The experimental adapter
therefore rejects unmapped controlled symbols and never invents `kind: event`.

## Language and annotation status

| Question | Finding | OpenLunum decision |
|---|---|---|
| English | Covered through the UP/PropBank inventory, but some underlying English treebank data has separate LDC or corpus terms | Auxiliary use requires per-source license review |
| French, German, Spanish | Included among the UP language inventory reported by the project materials | Candidate auxiliary supervision only after underlying treebank license review |
| Greek | Not identified as a UP2.0 annotated language in the primary UP2 release materials reviewed | Do not infer Greek coverage; retain OpenLunum-reviewed Greek data |
| Indonesian | Not identified as a UP2.0 annotated language in the primary UP2 release materials reviewed | Do not infer Indonesian coverage; retain OpenLunum-reviewed Indonesian data |
| Gold vs generated | UP2.0 combines automatically generated multilingual propbanks with manual annotation for only a subset of languages | Treat generated rows as auxiliary/noisy supervision, never Lunum gold |
| Predicate representation | PropBank predicates are roleset/sense oriented | Map by explicit roleset table; no string fallback |
| Argument representation | Argument spans and labels are source annotations | Preserve spans/evidence; map roles losslessly only where proven |
| Interlingual mapping | Multilingual release does not make every Lunum predicate/role interlingually identical | Candidate-set evidence only; ambiguity fails closed |

The absence of a language above means “not verified for this release,” not
“the language has no PropBank resources.” Current UD language availability
also cannot be inferred from a language list alone; each treebank has its own
license and release history.

## Training recommendation

Use UP2 format and public role/predicate conventions as optional auxiliary
supervision research. Use only individually cleared underlying treebanks for
training. Keep Lunum-specific frame slots, abstention, grounding, canonical
identity, and safety examples in independently reviewed Lunum data. Never
export UP2 labels directly as canonical Lunum semantics.

The machine-readable companion manifest records the conservative disposition.
This audit did not download or bundle UP2 data.

## Sources

- [Universal Propositions project](https://universalpropositions.github.io/)
- [Universal PropBank 2.0 paper](https://aclanthology.org/2022.lrec-1.181/)
- [UniversalPropositions UP-1.0 repository and migration notes](https://github.com/UniversalPropositions/UP-1.0)
- [Universal Dependencies licensing guidance](https://universaldependencies.org/contributing/licensing.html)
- [Universal Dependencies license inventory](https://github.com/UniversalDependencies/LICENSE/blob/master/license-ud-2.18.html)
- [PropBank project](https://propbank.github.io/)
