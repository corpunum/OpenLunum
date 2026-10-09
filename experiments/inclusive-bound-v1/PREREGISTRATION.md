# Inclusive-bound predicate v1: pre-registered bar

Written 2026-10-08, before implementation, and committed before the results.

## Question

`lunum-protocol/0.4` has only strict comparisons (`below`, `above`). Contract
0.16 therefore tells extractors to abstain on inclusive bounds (`up to`,
`at most`, `at least`, Greek `έως`, `το πολύ`, `τουλάχιστον`), so g02
(`… δαπάνες έως 2.000 ευρώ`) cannot get an identity. Can an inclusive
comparison be added as a new protocol version without breaking frozen
packages or existing identities?

## Change (planned)

- `lunum-protocol/0.5`: new predicates `at_most` and `at_least` (no aliases;
  `up_to` is not an alias, so a near-miss name stays unresolved).
- `lunum-frame/0.6`: frames for both, `subject` + `value`, required, exactly
  like `below`/`above`.
- Contract `lunum-agent/0.17`: the threshold rule says inclusive bounds are
  `at_most`/`at_least` conditions; strict ones stay `below`/`above`.
- Golden vectors for the new predicates; `below` and `at_most` with the same
  roles must get different `lfp:2.1` fingerprints.
- Instruction package v19 and served-runtime manifest v19 frozen by the repo's
  freeze process; v18 and earlier stay immutable, tested as historical.

## Bar

The change lands only if all hold:

1. **No identity changes:** replay of every recorded candidate in the
   repository (as `replay-literal-retention-0020.mjs`, baseline = `origin/main`
   build): 0 identities withdrawn, 0 gained, 0 fingerprints changed.
2. **Existing golden vectors unchanged** (byte-identical expected fingerprints).
3. **Frozen packages:** v18 and earlier keep passing their historical binding
   tests (drift reported exactly as for v17 after v18), no frozen file edited.
4. **g02 deterministic:** an `allow` candidate with an `at_most` 2000 EUR
   condition receives identity; the same without the condition is refused.
5. `pnpm verify` green locally and in CI.

If the freeze needs a permission the session does not have, the work stops
and is reported, with the code change unmerged.

## Optional live check (small spend)

After the freeze: g02 and one English inclusive bound (`Analysts may export
up to 500 rows.` is **not** used — it has no permitter; instead
`The finance lead allows Omar to approve invoices up to 5,000 euros.`) on v19,
`claude-sonnet-5`, $0.60 per item, $1.50 total. Pass: both receive identity
with an `at_most` condition. Reported either way; not part of the landing bar.

## Not established

Core cannot tell strict from inclusive wording: a candidate that encodes
`έως` as `below` is still accepted (presence floor, not meaning verification).
