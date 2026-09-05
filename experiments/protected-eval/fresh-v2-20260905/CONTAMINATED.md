# Contaminated protected attempt

This corpus was generated after implementation freeze but was stopped during
gold preflight before any model call. The evaluator's semantic-atom path
normalizer fails to resolve indexed nested paths such as
`clauses[0].conditions[0].roles.value.value`; therefore this corpus cannot
support a protected claim. It must be preserved for diagnosis only and must
not be repaired/reused for a capability result. The next protected corpus
must be independently generated after the evaluator fix is committed and
verified.

Additional preflight findings were five invalid visibility term annotations;
those are corpus annotations, not a basis for changing the protocol.
