## Experiment Notes

### Current Status
- Created experiment manifest for multilingual error taxonomy
- Claimed area: multilingual-parse
- Branch: agent/multilingual-parse/multilingual-error-taxonomy

### Next Steps
1. Analyze the multilingual-core-v1 dataset for parsing failures
2. Identify patterns in entity, role, negation, condition, quantity, time, and ambiguity errors
3. Create structured taxonomy categories with examples
4. Document error characteristics and patterns
5. Build classification system for error categorization

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: 002ef8c5a7fcdb92311b8ec1b1cc0cece782e41e

### Implementation Approach
- Start with existing parsing failures in the dataset
- Create structured categories for each type of error
- Define clear criteria for classification
- Document patterns and examples for each category
- Ensure taxonomy supports multilingual error detection