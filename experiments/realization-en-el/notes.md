## Experiment Notes

### Current Status
- Created experiment manifest for realization experiments
- Claimed area: realization
- Branch: agent/realization/realization-en-el

### Next Steps
1. Create realization engine for English
2. Create realization engine for Greek
3. Implement protected literal preservation
4. Add semantic identity verification
5. Create test suite
6. Document realization patterns

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: e17b95f3d8d0f523c37fbb35c2d90397739a3d72

### Implementation Approach
- Build on existing renderer infrastructure
- Create language-specific realization rules
- Preserve protected literals during realization
- Verify semantic identity after realization