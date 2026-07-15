# Evaluator Instructions for Protected Dataset

## Dataset

| Field | Value |
|---|---|
| **ID** | `<dataset-id>` |
| **Version** | `<version>` |
| **Path** | `<path>` |
| **SHA-256** | `<hash>` |
| **Items** | `<count>` |
| **Languages** | `<languages>` |
| **Access** | `<access-level>` |

## Evaluation Protocol

1. **Verify hash** — Before using the dataset, verify its SHA-256 matches the manifest.
2. **Do not share contents** — Do not include raw protected data in PR bodies, reports, or agent outputs unless explicitly required.
3. **Reference by ID** — Reference items by their stable ID, not by content.
4. **Log failures only** — Log item IDs and failure categories; do not log raw source text unless the instructions say otherwise.
5. **Fresh context** — The evaluator should start from a fresh context, not optimized against this dataset.

## Scoring Rules

- **Schema validity**: All outputs must produce valid Lunum-Sem matching the schema.
- **Semantic retention**: Entities, negation, conditions, quantities, time, modality must be preserved.
- **Independent evaluation**: Evaluator does not change the candidate implementation.
- **Holdout**: This dataset was not used during development/optimization.

## Report Format

```markdown
### Protected evaluation: <dataset-id>/<version>

| Metric | Result |
|---|---|
| Schema-valid rate | X/Y |
| Exact fingerprint rate | X/Y |
| Semantic retention | X/Y |
| Failures | <list of item IDs> |
```

## Exclusions

List any items excluded and why.
