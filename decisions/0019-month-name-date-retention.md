# ADR 0019 — Recognise English and Greek month-name dates in source retention

**Status:** Implemented 2026-10-07. Self-reviewed (Claude Code agent, model
`claude-opus-5-5`; no human or native-speaker review). Agent contract
`lunum-agent/0.15`, instructions `agent-extraction-instructions/0.5`,
instruction package v17. No live parser/model calls. Issues #714 and #713.

## Reproduction

The 2026-10-06 MCP verification (#714) submitted the same deadline Sem
`time: {type: date, value: 2027-01-14}` with five sources. ISO and dotted
sources in English and Greek received one `lfp:2.1` identity.
`Project Orion is due on 14 January 2027.` and
`Το έργο Orion λήγει στις 14 Ιανουαρίου 2027.` were refused with
`unretained_source_literal: 14, 2027`. ADR 0018's date reader knew only ISO
and dotted spellings, so the day and year of a month-name date were read as
bare quantities. A correct date encoding was refused. An extractor could only
get identity by adding meaningless numeric roles, or by abstaining. This hit
the natural Greek form chosen in the native-Greek review of V8 (#685).

## Decision

`checkLiteralRetention` also recognises a **full** month-name date as a date
span, normalised to ISO and compared exactly, like ISO and dotted dates:

- English, day first: `14 January 2027`, `14th of January 2027`,
  `14 Jan. 2027`, `14 January, 2027`.
- English, month first: `January 14, 2027`, `Jan. 14 2027`, `Sept 3rd, 2026`.
- Greek, day first only: genitive (`14 Ιανουαρίου 2027`, the date form),
  nominative (`Ιανουάριος`), colloquial (`Γενάρη`, `Μάη`, `Σεπτέμβρη` …) and
  abbreviated (`Ιαν`, `Σεπτ.` …) month names, and the ordinal `1η`/`1ης`.
- Case, accents and diaeresis are ignored (`ΙΑΝΟΥΑΡΙΟΥ`, `Μαιου`, `Μαΐου`,
  NFD input). The final sigma is folded.

The day, a month name and a four-digit year must all be present, and the date
must be valid in the Gregorian calendar. The boundaries are those of ADR 0018:
a span inside an identifier, a longer number or a word is not a date.
Abbreviations may take a period. Full names may not (`January.` ends a
sentence). Lower-case English `may` is the modal verb, not a month. Greek
month-first order is not a date convention and is not recognised.

The following are deliberately **not** normalised. They fall through to the
numeric floor, so their numbers must still be carried:

- Partial dates without a year: `15 March`, `31 Δεκεμβρίου` (review items e11
  and g07). A year is never guessed.
- Month and year without a day: `January 2027`.
- Calendar-invalid dates: `31 February 2027`.
- Weekday names, relative dates (`next Friday`) and number words.

Candidate values are read **one semantic field at a time**. A month-name value
inside one field (`"14 Ιανουαρίου 2027"`) counts as that date, like an ISO or
dotted value. Separate fields (`count: 14`, `time: "January 2027"`) cannot be
joined into a date that none of them carries. ISO and dotted dates could never
span fields, so their results do not change.

## Retention guarantee

The literal-retention guarantee is unchanged. A month-name source date is
missing unless the candidate carries the same ISO date. A dropped date, a
shifted day or year, a valid day/month swap (`5 December 2026` vs
`2026-05-12`), and a date used to satisfy a separate quantity
(`14 January 2027 after 14 retries`) are all refused. Diagnostics name the
missing ISO date. Mutation cases for cross-field composition, modal `may` and
Greek month-first order are caught by the readiness mutation gate.

## Compatibility

There is no schema, vocabulary, frame or `lfp:2.1` projection change. Sem date
values are not rewritten. Parser instructions still require ISO Sem values. For
an unchanged representation, the only change is availability: a candidate
whose source states a full month-name date and that carries that date as ISO
was refused and now receives identity. A candidate that met the old floor only
by carrying the bare day and year as numbers now loses identity unless it
also carries the date. That is the intended correction. No durable records
are rewritten or promoted.

The contract text changes, so the contract is `lunum-agent/0.15` with
instructions 0.5. Instruction package v17 and served-runtime manifest v17 bind
the new served bytes. They also include the MCP `lunum_compile_context` token
report fix (#713), whose `selectedTokens` now comes from core
`compileContext`. Core now returns the `selectedTokens` behind
`ratio`/`estimatedSavings`, and the tool also exposes `identityDedupTokens`.
`shadow_mixed` continues to report the mixed shadow measurement that its ratio
describes. V16 and earlier packages remain unaltered historical evidence. They
fail the current live preflight. Additive scoring manifest v4 and source
review v3 rebind the same historical bytes to 0.15, for offline diagnostic
use only.

## Limits

This remains a presence floor, not source meaning certification (ADR 0018).
Recognition is limited to English and Greek month names. Other languages'
month-name dates are read as numbers and stay fail-closed. The month table was
written by a model and has had no native-speaker review. Contract 0.15
protected/live quality is **NOT RUN**.
