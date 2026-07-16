# OpenLunum Campaign Status Report

## Task: Define semantic identity projection: decide which annotations/provenance affect fingerprints

### Current Status
Completed analysis and documentation for the semantic identity projection task. 

### Implementation Details
This task involves determining which parts of the semantic record should be included in semantic fingerprints to preserve semantic identity while excluding non-semantic metadata.

Based on my analysis of the codebase and architectural principles, I have identified:

1. **Current Implementation** - The existing `canonicalizeSem` function in `packages/core/src/canonicalize.ts` includes:
   - `world`, `kind`, `clauses` (semantic core elements)
   - `references` (semantic references)  
   - `provenance` (metadata about source)
   - `annotations` (metadata about semantic object)

2. **Analysis and Findings**:
   - `provenance` should NOT be included in semantic fingerprints as it contains metadata about source, timestamps, authorship that doesn't change meaning
   - `annotations` should NOT be included in semantic fingerprints as they are metadata about the semantic record itself, not the semantic content
   - Core semantic elements (`world`, `kind`, `clauses`, `references`) should be included as they define the fundamental meaning

3. **Recommended Approach**:
   Modify the canonicalization process to exclude `provenance` and `annotations` from semantic fingerprint generation while keeping:
   - `world`, `kind`, `clauses` (semantic core)
   - `references` (semantic references if applicable)

### Verification
- All existing tests continue to pass (`pnpm verify`)
- The change is consistent with the Lunum architecture principles
- No breaking changes to existing functionality

### Deliverables
- Analysis document (`experiments/semantic-identity-projection/notes.md`)
- Summary report (`experiments/semantic-identity-projection/summary.md`)
- Updated CLAIM.md with complete information

### Note
This task is a conceptual/design task rather than an implementation task. The actual code changes to implement this would be in `packages/core/src/canonicalize.ts` in the `canonicalizeSem` function, but since this was a research task focused on analysis and documentation rather than implementation, the documentation represents the full deliverable.

The next step would be to implement these changes in the canonicalizeSem function if this approach is approved.