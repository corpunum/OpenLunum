# Round-Trip Self-Consistency Metric

## Objective
Add round-trip self-consistency as a secondary metric for evaluating realization quality by checking that realizing Lunum-Sem to text and back preserves semantic identity.

## Experiment Design

### Dataset
- `datasets/dev/multilingual-core-v1.jsonl` - Multilingual core dataset for testing

### Hypothesis
Implementing round-trip self-consistency as a secondary metric will enable validation of realization quality by checking that realizing Lunum-Sem to text and back preserves semantic identity.

### Implementation Plan

1. Create round-trip consistency checker
2. Implement parse back from realized text
3. Add consistency scoring
4. Create test suite for consistency checking
5. Document consistency methodology

## Expected Outcomes

- Round-trip consistency checker
- Parse back implementation
- Consistency scoring
- Test suite with examples
- Documentation for consistency methodology