# Experiment Claim: Issue #11 - Retrieval and Integration Runners

## Worker Agent
agent/phase6-1/retrieval-integration-runners-v2

## Area
Retrieval and Integration

## Queue Item
Issue #11 - retrieval and integration experiment runners

## Branch
agent/phase6-1/retrieval-integration-runners-v2

## Date
2026-07-16

## Hypothesis
Implement deterministic, fixture-driven retrieval and integration experiment runners that can be executed without a model profile, while maintaining full compatibility with the existing PR #10 experiment runner architecture.

## Dependencies
- PR #10 baseline: 5ca28b9c0f0366a46eac5edd163b65b7024714ff
- Existing runner architecture in packages/eval/src/runner.ts

## Completion Condition
- Retrieval runner implemented with proper ranking behavior, metrics, and failure handling
- Integration runner implemented with allowlisted adapter registry, conformance checking, and failure handling
- Both runners tested with synthetic manifests and fixtures
- Generated bundles validated through repository report validation
- Full verification suite passes with no regressions

## Dataset
Synthetic fixtures for retrieval and integration tasks

## Model Profile
None required (deterministic runners)

## Evaluation Metrics
For Retrieval:
- Precision@k
- Recall@k  
- MRR (Mean Reciprocal Rank)
- False positives
- False negatives
- False equivalences

For Integration:
- Conformance status
- Artifact availability
- Exit codes
- Schema compliance