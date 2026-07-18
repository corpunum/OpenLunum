## Experiment Notes

### Current Status
- Created experiment manifest for round-trip consistency
- Claimed area: realization
- Branch: agent/realization/roundtrip-consistency

### Next Steps
1. Create round-trip consistency checker
2. Implement parse back from realized text
3. Add consistency scoring
4. Create test suite
5. Document consistency methodology

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: e17b95f3d8d0f523c37fbb35c2d90397739a3d72

### Implementation Approach
- Build on existing realization infrastructure
- Create parse-back functionality
- Implement consistency comparison
- Integrate with existing scoring system