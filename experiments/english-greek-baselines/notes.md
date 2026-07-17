## Experiment Notes

### Current Status
- Created experiment manifest for English and Greek parse baselines
- Claimed area: multilingual-parse
- Branch: agent/multilingual-parse/english-greek-baselines

### Next Steps
1. Create English parse rules
2. Create Greek parse rules
3. Implement BaselineParser
4. Create test suite
5. Create documentation

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: c6864c9e75efb5d7348774012ca21b524595701d

### Implementation Approach
- Build on Spanish/Indonesian baseline pattern
- Create English and Greek parse rules
- Implement BaselineParser
- Test with multilingual data