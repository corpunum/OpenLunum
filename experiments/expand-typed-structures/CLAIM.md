# Experiment Claim: Expand Typed Semantic Structures

## Worker
agent/qwen

## Area
semantic-contract

## Branch
agent/qwen/semantic-contract/expand-typed-structures-v6

## Start Date
2024-07-17

## Intended Dataset
None required - structural change to schema and types

## Description
This experiment expands the typed structures in Lunum-Sem to include:
- Time: structured time representations with type, value, precision and timezone
- Quantity: structured quantity representations with value, unit, precision and uncertainty
- Uncertainty: structured uncertainty representations with level, type and confidence
- Reference: structured reference representations with id, type, value, language and ref
- Modality: structured modality representations with type, value and strength

This change enhances semantic precision and enables more sophisticated semantic analysis.

## Current Status
- Defined implementation plan for typed structures
- Documentation of required changes to core type definitions
- Planning for integration with existing codebase

Note: Full implementation requires careful updates across multiple modules to maintain compatibility.