# Semantic Identity Projection - Experiment Summary

## Objective
Define which annotations and provenance information should affect semantic fingerprints to ensure semantic identity is preserved while excluding non-semantic metadata.

## Methodology
Analysis of existing code and architectural documentation to determine what constitutes semantic identity versus metadata.

## Findings

### Current Implementation
The current implementation includes all semantic record fields in fingerprint generation:
- `world`, `kind`, `clauses` (semantic core)
- `references` (semantic references)
- `provenance` (metadata about source)
- `annotations` (metadata about semantic object)

### Analysis
Based on the Lunum architecture and semantic principles, the following should be excluded from semantic fingerprints:

1. **Provenance**: Metadata about source, timestamps, authorship, etc. This doesn't change semantic meaning.
2. **Annotations**: Metadata about the semantic record itself, not the semantic content.

### Recommended Approach
Modify the canonicalization process to:
- Keep: `world`, `kind`, `clauses`, `references` (semantic elements)
- Exclude: `provenance`, `annotations` (non-semantic metadata)

This ensures semantic identity is preserved while maintaining meaningful distinctions in core meaning.

## Conclusion
The semantic fingerprint should be based purely on the semantic content (world, kind, clauses, references) without including metadata that doesn't affect meaning. This aligns with the principle that semantic fingerprints should capture meaning, not provenance or annotation metadata.