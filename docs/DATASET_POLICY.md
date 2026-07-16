# Dataset policy

## Dataset tiers

- `datasets/dev/`: visible iteration fixtures.
- `datasets/adversarial/`: visible semantic and safety traps.
- `datasets/protected/`: holdout manifests or encrypted/private references; workers must not optimize against contents.
- Product-private datasets stay outside Git and are referenced by versioned hash and access instructions.

## Integrity rules

- Every experiment pins a dataset SHA-256.
- Every item has a stable ID and semantic group where applicable.
- Changes to gold semantics require review distinct from implementation changes.
- Never copy private user conversations into Git without explicit sanitization and approval.
- Preserve negative, ambiguous, and unparseable examples.
- Dataset licenses and provenance must be recorded before public release.

## Leakage and overfitting

Workers may see development and adversarial sets. Protected results are requested only after a candidate is frozen. A worker that has seen protected contents cannot claim an independent holdout result for that dataset version.
