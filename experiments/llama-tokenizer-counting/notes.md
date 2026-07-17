## Experiment Notes

### Current Status
- Created experiment manifest for llama tokenizer counting
- Claimed area: renderer
- Branch: agent/renderer/llama-tokenizer-counting

### Next Steps
1. Create llama tokenizer counting framework
2. Implement BPE tokenization
3. Add special token handling
4. Create measurement tests
5. Create documentation

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: c6864c9e75efb5d7348774012ca21b524595701d

### Implementation Approach
- Build on existing tokenizer infrastructure
- Implement BPE tokenization
- Add special token handling
- Test with multilingual data