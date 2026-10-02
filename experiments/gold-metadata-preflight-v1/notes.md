# Before implementation

On `a4aa081`, current built `validateEvaluationGold` returned invalid=[] for
both an explicit parse target with null gold and an abstention target with a
non-null canonical preference Sem. Both were counted as abstention cases.
The runner also selects a prefix before validating gold. No provider was
contacted during this reproduction.

A canonical preference gold dropped source number 5 and also passed this
preflight. Submitting exactly that gold against its raw source through the
real candidate API withheld identity (`unretained_source_literal`). Gold and
model candidates must share that necessary source floor. It still cannot
prove word-only restrictions, units, role accuracy or full meaning preservation.

Full verification exposed legacy callers that discarded source metadata before
invoking gold preflight. Source-bound review/scoring now forwards the existing
source and language. Pure Sem-to-Sem comparison uses its existing structural,
registry, frame and identity validators instead; it cannot qualify source gold
and does not invent a source sentence.

The first full verification also rejected a test fixture with source `Test 1.`
and a preference gold omitting 1. Its mixed-result test formerly made one call
and asserted only an item count. The regression now supplies two meaningful
source fixtures and asserts one exact success and one schema-valid
wrong-negation failure. The gold/source safety gate is unchanged.

The offline audit newly exposes `deadline-release-de` in fresh-v1: the current
digit floor reads dotted date `30.11.2026` as decimal `30.11`, so it rejects ISO
date gold. This is a literal-check false rejection, not evidence of wrong gold
or model misunderstanding. The frozen corpus remains unchanged.
