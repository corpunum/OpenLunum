## Experiment Notes

### Current Status
- Created experiment manifest for protected-literal scoring
- Claimed area: realization
- Branch: agent/realization/protected-literal-scoring

### Next Steps
1. Create protected-literal detection system
2. Implement independent semantic scoring
3. Add scoring to realization engine
4. Create test suite
5. Document scoring methodology

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: e17b95f3d8d0f523c37fbb35c2d90397739a3d72

### Implementation Approach
- Build on existing realization infrastructure
- Create protected-literal detection rules
- Implement semantic scoring algorithms
- Integrate with existing realization engine