# Semantic Identity Projection Analysis

## Problem Statement

The task is to define which annotations and provenance information should be included in semantic fingerprints to maintain semantic identity while excluding non-semantic metadata that shouldn't affect meaning.

## Analysis of Current Implementation

Based on the code in `packages/core/src/fingerprint.ts` and `packages/core/src/canonicalize.ts`:

### What Currently Gets Included in Fingerprints:
1. `world` - core semantic domain
2. `kind` - semantic class/category
3. `clauses` - the actual semantic content
4. `references` - semantic references if present
5. `provenance` - provenance metadata if present
6. `annotations` - annotation metadata if present

### Key Questions:
1. Should `provenance` affect semantic identity?
2. Should `annotations` affect semantic identity?
3. What makes an annotation "semantic" vs "non-semantic"?

## Hypothesis

Semantic fingerprints should be invariant to non-semantic annotations and provenance metadata that do not affect core meaning, while preserving semantic distinctions that change meaning.

## Research Findings

From analyzing the Lunum architecture and semantics:

### Semantic Core Elements:
- `world`, `kind`, and `clauses` are the core semantic elements that define meaning
- These elements should be included in semantic fingerprints because they define the fundamental meaning

### Non-Semantic Elements:
- `provenance` contains metadata like source, timestamps, authorship that doesn't change meaning
- `annotations` are metadata about the semantic object itself, not the semantic content

### Evidence-Based Approach:
1. **Provenance**: Should NOT be included in semantic fingerprints as it's metadata about the source, not the meaning
2. **Annotations**: Should NOT be included in semantic fingerprints as they are metadata about the semantic object, not the core semantic content

This approach aligns with the principle that semantic fingerprints should be about meaning preservation, not about provenance or metadata.

## Proposed Solution

Modify the canonicalization process to exclude `provenance` and `annotations` from semantic fingerprint generation while keeping:
- `world`
- `kind` 
- `clauses`
- `references` (if they are semantic references, not metadata)

This ensures that two semantically identical records with different provenance or annotations will have the same fingerprint.