# Recorded meaning diagnostics v1

This is an **offline, post-hoc, self-reviewed development instrument**, not a
protected evaluation, new live run, or promotion gate. It supersedes no frozen
file. The original round-two probes, expectations, ledgers and report remain
untouched.

## Why

The old probe scorer counted an issued identity as a successful parse. That
does not establish that its source meaning survived. The reported manual
20/30 meaning score also has a demonstrated reading error: e02 contains the
5000-euro condition. There are additional unreported source losses (the failed
qualifier in e15 and production scope in g08) and modality ambiguities (e19,
g01). Adding one to 20/30 would therefore not repair the assessment.

## Target scope

`targets.jsonl` covers all 30 original sources without altering any original
outcome label. Twelve parse targets and four abstention targets have scoped
self-review. Fourteen rows remain explicitly unresolved: unsupported
composition, disputed task expectation, ambiguous modality or referent/type
review. Every Greek judgment is non-native and uncertified. The two Luna
read-only audits are not human or cross-vendor review.

These post-hoc targets are deliberately exposed development data. They cannot
be reused as a fresh holdout or certified training gold. Their exact typed
encodings are inspectable hypotheses about source meaning. For example,
e02's formal invoice/amount scope still requires external review even though
the allegation that its numeric condition is absent is falsified.

## Scorer

`scripts/research/score-recorded-meaning.mjs` compares recursive,
position- and role-bound atoms. Polarity, modality, time, units, nested
relations, arrays, multiplicity and semantic references are included;
provenance, annotations and explicit surface-reference evidence are not.
It does not translate or guess equivalence between open IDs, or flatten
id/ref/value representation differences into matches. A representation
disagreement is not automatically proof of language misunderstanding.

Gold must pass the actual transport, structural, protocol, frame and strict
identity gates, plus source digit retention. Aliased/noncanonical gold is
rejected rather than rewritten. Candidate normalization is disclosed, and
transport-invalid unknown fields cannot be erased to grant a match. Issued
identities and confidence are not fidelity scores.

Per-item missing/extra atoms, dimensions and overlapping failure classes are
reported. Feature precision/recall applies only to reviewed parse targets;
missing, malformed or abstained parses still contribute their full expected
atoms and zero matches. Empty observed precision is null, not 100%.
Reviewed coverage and all unresolved rows remain in the full task count.
Correct declared abstentions are separate from core abstention submissions:
all seven historical abstentions were declarations without null submissions,
so four correct reviewed declarations do not demonstrate accepted core
abstentions. This was also what the historical task explicitly requested.
Matching many easy atoms must not offset one critical mismatch: exact
representation status and every failure are reported separately. There is
intentionally no overall meaning-accuracy percentage while targets are
unresolved.

## Reproduce (zero model calls)

```bash
pnpm build
pnpm test:source-only-scoring
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v1/input-manifest.json \
  /path/to/a/new-diagnostic-output.json
```

The output path must not already exist. Input files and every referenced raw
stream are hash-checked. Observed public contract tool results in all raw
streams are hashed and compared with the frozen package and candidate
ledgers; a merely hash-shaped string or an agent's prose is insufficient.
The manifest also binds schema bytes and scoring
contract versions; historical extraction used contract0.10 whereas current
validity checks use contract0.12. That is a replay distinction, not evidence
that 0.12 improves extraction. The original runner's documented binding
limitations are not retroactively certified by this scorer.

The adversarial tests mutate roles, predicates, quantities, units, dates,
modality, nested structure and evidence bindings. Two in-memory mutants of
the actual scorer deliberately disable modality and actor-role binding; the
corresponding regression assertions fail against those mutants.

## Next

Review unresolved source meanings and the representation conventions
independently, especially with a native Greek reviewer. Only then freeze a
new corpus and implementation before a separately budgeted live experiment.
No parser, prompt, identity or runtime change is justified by this diagnostic
alone.
