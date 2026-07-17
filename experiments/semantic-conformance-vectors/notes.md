## Experiment Notes

### Current Status
- Created experiment manifest for canonical conformance vectors
- Claimed area: semantic-contract
- Branch: agent/semantic-contract/semantic-conformance-vectors

### Next Steps
1. Implement property tests for semantic contract structures
2. Create canonical conformance vectors
3. Add validation functions for semantic identity projection
4. Test with multilingual-core-v1 dataset
5. Document and validate findings

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: 002ef8c5a7fcdb92311b8ec1b1cc0cece782e41e

### Implementation Approach
- Build upon existing schema-conformance.ts structure
- Add property-based testing for semantic contract structures
- Create conformance vectors that capture semantic identity
- Ensure compatibility with existing typed structures from previous work